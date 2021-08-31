package us.moria.js13k;

import com.google.javascript.jscomp.*;
import com.google.javascript.jscomp.Compiler;
import com.google.protobuf.ByteString;
import com.google.protobuf.CodedOutputStream;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.Channels;
import java.nio.channels.ReadableByteChannel;
import java.nio.channels.WritableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * A daemon process which compiles JavaScript source code. Accepts requests in
 * protocol buffer format, and sends responses in protocol buffer format.
 *
 * The main reason that this process exists is to avoid paying for JVM startup
 * time each time the JavaScript source code should be compiled. The other
 * reason this exists is because the API for specifying compiler options is much
 * nicer to use than specifying command-line flags.
 */
public class CompilerDaemon {
    /**
     * The maximum size of a protocol buffer message which can be sent or
     * received. Partly intended as a sanity check. If the stream gets out of
     * sync, arbitrary bytes will be interpreted as a message size, which may be
     * too large.
     */
    final static int MAX_MESSAGE_SIZE = 64 * 1024 * 1024;

    /**
     * Buffer used for communicating with the devserver. Resized as needed.
     */
    private ByteBuffer ioBuffer;

    /**
     * Input stream for reading messages from the devserver.
     */
    private final ReadableByteChannel in;

    /**
     * Output stream for sending messages to the devserver.
     */
    private final WritableByteChannel out;

    /**
     * List of extern source files for the Closure compiler. These files are
     * typically part of the Closure compiler itself, stored inside the Closure
     * compiler library JAR file.
     */
    private final List<SourceFile> externs;

    static class BadRequest extends Exception {
        public BadRequest(String message) {
            super(message);
        }
    }

    CompilerDaemon() {
        ioBuffer = ByteBuffer.allocateDirect(8 * 1024);
        in = Channels.newChannel(System.in);
        out = Channels.newChannel(System.out);
        externs = new ArrayList<>();
        try {
            externs.addAll(AbstractCommandLineRunner.getBuiltinExterns(CompilerOptions.Environment.BROWSER));
        } catch (IOException e) {
            System.err.println("Error: Could not load externs: " + e);
            System.exit(1);
        }
        externs.add(SourceFile.fromCode("ccl.js", "var goog;\n"));
    }

    private void run() {
        while (true) {
            CompilerProtos.BuildRequest request;
            try {
                request = readMessage();
                if (request == null) {
                    return;
                }
            } catch (IOException e) {
                System.err.println("Error: read: " + e);
                System.exit(1);
                return;
            }
            CompilerProtos.BuildResponse response = compile(request);
            try {
                writeMessage(response);
            } catch (IOException e) {
                System.err.println("Error: write: " + e);
                System.exit(1);
                return;
            }
        }
    }

    /**
     * Set the IO buffer size for communicating with the devserver. This may
     * replace the buffer with a new one, clearing all data in the old buffer.
     * The buffer position is reset to 0.
     */
    private void setBufferSize(int size) throws IOException {
        if (size > MAX_MESSAGE_SIZE) {
            throw new IOException("message too large: " + size);
        }
        if (size > ioBuffer.capacity()) {
            ioBuffer = ByteBuffer.allocateDirect(ceilPow2(size));
        }
        ioBuffer.clear().limit(size);
    }

    /**
     * Read a fixed amount of data, in bytes, into the buffer. The buffer is
     * resized as necessary. Existing data in the bufer is overwritten.
     */
    private boolean read(int size) throws IOException {
        setBufferSize(size);
        while (ioBuffer.remaining() > 0) {
            int amt = in.read(ioBuffer);
            if (amt < 0) {
                return false;
            }
        }
        ioBuffer.position(0);
        return true;
    }

    /**
     * Read a request message from the devserver.
     * @return The parsed message, or null if no more messages are pending.
     */
    private CompilerProtos.BuildRequest readMessage() throws IOException {
        if (!read(4)) {
            if (ioBuffer.position() == 0) {
                return null;
            }
            throw new IOException("unexpected EOF");
        }
        int length = ioBuffer.getInt();
        if (!read(length)) {
            throw new IOException("unexpected EOF");
        }
        return CompilerProtos.BuildRequest.parseFrom(ioBuffer);
    }

    /**
     * Write a response message to the devserver.
     */
    private void writeMessage(CompilerProtos.BuildResponse response) throws IOException {
        int size = response.getSerializedSize();
        setBufferSize(size + 4);
        ioBuffer.putInt(size);
        response.writeTo(CodedOutputStream.newInstance(ioBuffer));
        ioBuffer.position(0);
        while (ioBuffer.remaining() > 0) {
            out.write(ioBuffer);
        }
    }

    private static CompilerProtos.BuildResponse stringError(String msg) {
        return CompilerProtos.BuildResponse.newBuilder()
                .addDiagnostic(
                        CompilerProtos.Diagnostic.newBuilder()
                                .setSeverity(CompilerProtos.Diagnostic.Severity.ERROR)
                                .setMessage(msg)
                                .build())
                .build();
    }

    /**
     * Compile JavaScript source code in response to a request from the
     * devserver.
     */
    private CompilerProtos.BuildResponse compile(CompilerProtos.BuildRequest request) {
        CompilerProtos.BuildResponse.Builder response = CompilerProtos.BuildResponse.newBuilder();
        if (request.getFileCount() == 0) {
            return stringError("No source files");
        }
        final Path root = Path.of(request.getBaseDirectory());
        final List<SourceFile> sources = new ArrayList<>();
        for (String source : request.getFileList()) {
            sources.add(SourceFile.fromPath(root.resolve(source), StandardCharsets.UTF_8));
        }
        final Compiler compiler = new Compiler();
        compiler.setErrorManager(new ProtoErrorManager(response, root));
        CompilerOptions options;
        try {
            options = getCompilerOptions(request, root);
        } catch (BadRequest e) {
            return stringError(e.toString());
        }
        compiler.compile(externs, sources, options);
        if (!compiler.hasErrors()) {
            response.setCode(ByteString.copyFromUtf8(compiler.toSource()));
            SourceMap sourceMap = compiler.getSourceMap();
            if (sourceMap != null) {
                StringBuilder builder = new StringBuilder();
                try {
                    sourceMap.appendTo(builder, Path.of(request.getFile(0)).getFileName().toString());
                } catch (IOException e) {
                }
                String text = builder.toString();
                response.setSourceMap(ByteString.copyFromUtf8(text));
            }
        }
        return response.build();
    }

    /**
     * Return the smallest power of two which is equal to or larger than the
     * input.
     *
     * @throws ArithmeticException No such value exists.
     */
    static int ceilPow2(int x) throws ArithmeticException {
        if (x > (1 << 30)) {
            throw new ArithmeticException("number too large: " + x);
        }
        x -= 1;
        x |= x >> 1;
        x |= x >> 2;
        x |= x >> 4;
        x |= x >> 8;
        x |= x >> 16;
        return x + 1;
    }

    /**
     * Get the Closure compiler options which will be used to compile the soucre
     * code.
     */
    private static CompilerOptions getCompilerOptions(CompilerProtos.BuildRequest request, Path root) throws BadRequest{
        CompilerOptions options = new CompilerOptions();

        // Set language input & output.
        options.setLanguageIn(CompilerOptions.LanguageMode.ECMASCRIPT_2020);
        options.setLanguageIn(CompilerOptions.LanguageMode.ECMASCRIPT_2020);
        options.setStrictModeInput(true);
        options.setChunkOutputType(CompilerOptions.ChunkOutputType.GLOBAL_NAMESPACE);
        options.setEmitUseStrict(false);

        // Set defines.
        for (CompilerProtos.Define define : request.getDefineList()) {
            final String name = define.getName();
            if (name.isEmpty()) {
                throw new BadRequest("empty name for define");
            }
            final CompilerProtos.Define.ValueCase valueCase = define.getValueCase();
            if (valueCase == CompilerProtos.Define.ValueCase.BOOLEAN) {
                options.setDefineToBooleanLiteral(name, define.getBoolean());
            } else if (valueCase == CompilerProtos.Define.ValueCase.NUMBER) {
                options.setDefineToDoubleLiteral(name, define.getNumber());
            } else if (valueCase == CompilerProtos.Define.ValueCase.STRING) {
                options.setDefineToStringLiteral(name, define.getString());
            } else {
                throw new BadRequest("empty value for define");
            }
        }

        // Set source map output.
        String mapPath = request.getOutputSourceMap();
        if (!mapPath.isEmpty()) {
            options.setSourceMapDetailLevel(SourceMap.DetailLevel.ALL);
            options.setSourceMapOutputPath(mapPath);
            final List<SourceMap.LocationMapping> locationMaps = new ArrayList<>();
            String prefix = root.toString();
            if (!prefix.endsWith("/")) {
                prefix += "/";
            }
            locationMaps.add(new SourceMap.PrefixLocationMapping(prefix, "/"));
            options.setSourceMapLocationMappings(locationMaps);
        }

        // Set -ADVANCED_OPTIMIZATIONS.
        final CompilationLevel level = CompilationLevel.ADVANCED_OPTIMIZATIONS;
        level.setOptionsForCompilationLevel(options);
        level.setTypeBasedOptimizationOptions(options); // --use_types_for_optimization
        level.setWrappedOutputOptimizations(options); // --assume_function_wrapper

        // Miscellaneous options.
        final WarningLevel wLevel = WarningLevel.VERBOSE;
        wLevel.setOptionsForWarningLevel(options);
        // This only sets a define, and it's not used anywhere, so it will make
        // the compiler emit a warning (and have no other effect).
        // options.setBrowserFeaturesetYear(2020);
        options.setCodingConvention(CodingConventions.getDefault());
        options.setTrustedStrings(true);
        options.setWarningLevel(DiagnosticGroups.REPORT_UNKNOWN_TYPES, CheckLevel.WARNING);

        // options.setNumParallelThreads
        // options.setEnvironment
        // options.setContinueAfterErrors
        // options.renamePrefix
        // options.renamePrefixNamespace

        // Set entry points. This must be below ADVANCED_OPTIMIZATIONS, which
        // will override this.
        final List<ModuleIdentifier> entryPoints = new ArrayList();
        for (String entry : request.getEntryPointList()) {
            String fullPath = root.resolve(entry).toString();
            entryPoints.add(ModuleIdentifier.forFile(fullPath));
        }
        options.setDependencyOptions(DependencyOptions.pruneForEntryPoints(entryPoints));

        return options;
    }

    public static void main(String[] args) {
        CompilerDaemon daemon = new CompilerDaemon();
        daemon.run();
    }
}
