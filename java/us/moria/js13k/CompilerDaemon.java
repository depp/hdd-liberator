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

public class CompilerDaemon {
    final static int MAX_MESSAGE_SIZE = 64 * 1024 * 1024;

    private final Path root;

    private ByteBuffer ioBuffer;

    private final ReadableByteChannel in;

    private final WritableByteChannel out;

    private final CompilerOptions options;

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

    private void read(int size) throws IOException {
        setBufferSize(size);
        while (ioBuffer.remaining() > 0) {
            in.read(ioBuffer);
        }
        ioBuffer.position(0);
    }

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
