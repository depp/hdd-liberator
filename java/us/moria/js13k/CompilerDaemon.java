package us.moria.js13k;

import com.google.javascript.jscomp.AbstractCommandLineRunner;
import com.google.javascript.jscomp.CodingConventions;
import com.google.javascript.jscomp.CompilationLevel;
import com.google.javascript.jscomp.Compiler;
import com.google.javascript.jscomp.CompilerOptions;
import com.google.javascript.jscomp.SourceFile;
import com.google.javascript.jscomp.WarningLevel;
import com.google.protobuf.ByteString;
import com.google.protobuf.CodedOutputStream;

import java.io.EOFException;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.Channels;
import java.nio.channels.ReadableByteChannel;
import java.nio.channels.WritableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
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
     * Path to the workspace root directory.
     */
    private final Path root;

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
     * Closure compiler options.
     */
    private final CompilerOptions options;

    /**
     * List of extern source files for the Closure compiler. These files are
     * typically part of the Closure compiler itself, stored inside the Closure
     * compiler library JAR file.
     */
    private final List<SourceFile> externs;

    CompilerDaemon(Path root) {
        this.root = root;
        ioBuffer = ByteBuffer.allocateDirect(8 * 1024);
        in = Channels.newChannel(System.in);
        out = Channels.newChannel(System.out);
        options = getCompilerOptions();
        externs = new ArrayList<>();
        try {
            externs.addAll(AbstractCommandLineRunner.getBuiltinExterns(CompilerOptions.Environment.BROWSER));
        } catch (IOException e) {
            System.err.println("Error: Could not load externs: " + e);
            System.exit(1);
        }
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
    private void setBufferSize(int size) {
        if (size > MAX_MESSAGE_SIZE) {
            System.err.println("Error: message too large: " + size);
            System.exit(1);
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
    private void read(int size) throws IOException {
        setBufferSize(size);
        while (ioBuffer.remaining() > 0) {
            in.read(ioBuffer);
        }
        ioBuffer.position(0);
    }

    /**
     * Read a request message from the devserver.
     */
    private CompilerProtos.BuildRequest readMessage() throws IOException {
        try {
            read(4);
        } catch (EOFException e) {
            if (ioBuffer.position() == 0) {
                return null;
            }
            throw e;
        }
        int length = ioBuffer.getInt();
        read(length);
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

    /**
     * Compile JavaScript source code in response to a request from the
     * devserver.
     */
    private CompilerProtos.BuildResponse compile(CompilerProtos.BuildRequest request) {
        CompilerProtos.BuildResponse.Builder response = CompilerProtos.BuildResponse.newBuilder();
        final List<SourceFile> sources = new ArrayList<>();
        for (String source : request.getFileList()) {
            sources.add(SourceFile.fromPath(root.resolve(source), StandardCharsets.UTF_8));
        }
        if (sources.size() == 0) {
            response.addDiagnostic(
                    CompilerProtos.Diagnostic.newBuilder()
                            .setSeverity(CompilerProtos.Diagnostic.Severity.ERROR)
                            .setMessage("No source files")
                            .build());
            return response.build();
        }
        final Compiler compiler = new Compiler();
        compiler.setErrorManager(new ProtoErrorManager(response));
        compiler.initOptions(options);
        if (compiler.hasErrors()) {
            return response.build();
        }
        compiler.compile(externs, sources, options);
        if (!compiler.hasErrors()) {
            response.setCode(ByteString.copyFromUtf8(compiler.toSource()));
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
    private static CompilerOptions getCompilerOptions() {
        CompilerOptions options = new CompilerOptions();

        // Set language input & output.
        options.setLanguageIn(CompilerOptions.LanguageMode.ECMASCRIPT_2020);
        options.setLanguageIn(CompilerOptions.LanguageMode.ECMASCRIPT_2020);
        options.setStrictModeInput(true);
        options.setChunkOutputType(CompilerOptions.ChunkOutputType.GLOBAL_NAMESPACE);
        options.setEmitUseStrict(false);

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

        // options.setNumParallelThreads
        // options.setEnvironment
        // options.setContinueAfterErrors
        // options.renamePrefix
        // options.renamePrefixNamespace

        return options;
    }

    /**
     * Get the workspace root directory. This assumes that the JAR file was
     * invoked from within Bazel, e.g., by the devserver.
     */
    private static Path getRoot() {
        String workdir = System.getenv("BUILD_WORKING_DIRECTORY");
        if (workdir != null) {
            return Paths.get(workdir);
        }
        return Paths.get("").toAbsolutePath();
    }

    public static void main(String[] args) {
        Path root = getRoot();
        CompilerDaemon daemon = new CompilerDaemon(root);
        daemon.run();
    }
}
