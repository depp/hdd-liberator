package us.moria.js13k;

import com.google.javascript.jscomp.AbstractCommandLineRunner;
import com.google.javascript.jscomp.CodingConventions;
import com.google.javascript.jscomp.CompilationLevel;
import com.google.javascript.jscomp.Compiler;
import com.google.javascript.jscomp.CompilerOptions;
import com.google.javascript.jscomp.SourceFile;
import com.google.javascript.jscomp.WarningLevel;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

public class CompilerDaemon {
    private static CompilerOptions getCompilerOptions() {
        CompilerOptions options = new CompilerOptions();

        // Set language input & output.
        options.setLanguageIn(CompilerOptions.LanguageMode.ECMASCRIPT_2020);
        options.setLanguageIn(CompilerOptions.LanguageMode.ECMASCRIPT_2020);
        options.setStrictModeInput(true);
        options.setChunkOutputType(CompilerOptions.ChunkOutputType.ES_MODULES);

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
        final Compiler compiler = new Compiler();
        final CompilerOptions options = getCompilerOptions();
        compiler.initOptions(options);
        if (compiler.hasErrors()) {
            return;
        }
        final List<SourceFile> externs = new ArrayList<>();
        try {
            externs.addAll(AbstractCommandLineRunner.getBuiltinExterns(CompilerOptions.Environment.BROWSER));
        } catch (IOException e) {
            System.err.println("Error: Could not load externs: " + e);
            System.exit(1);
        }
        final List<SourceFile> sources = new ArrayList<>();
        sources.add(SourceFile.fromPath(root.resolve("demo/main.js"), StandardCharsets.UTF_8));
        compiler.compile(externs, sources, options);
        String code = compiler.toSource();
        System.out.println(code);
    }
}
