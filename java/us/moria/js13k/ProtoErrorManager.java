package us.moria.js13k;

import com.google.common.collect.ImmutableList;
import com.google.javascript.jscomp.CheckLevel;
import com.google.javascript.jscomp.ErrorManager;
import com.google.javascript.jscomp.JSError;

import java.util.ArrayList;
import java.util.List;

/**
 * Handle errors from the Closure compiler. Errors are added to a protocol
 * buffer message.
 */
class ProtoErrorManager implements ErrorManager {
    private final CompilerProtos.BuildResponse.Builder response;
    private final List<JSError> errors;
    private final List<JSError> warnings;
    private double typedPercent;

    public ProtoErrorManager(CompilerProtos.BuildResponse.Builder response) {
        this.response = response;
        errors = new ArrayList<>();
        warnings = new ArrayList<>();
    }

    @Override
    public void report(CheckLevel level, JSError error) {
        CompilerProtos.Diagnostic.Severity severity;
        if (level == CheckLevel.ERROR) {
            severity = CompilerProtos.Diagnostic.Severity.ERROR;
            errors.add(error);
        } else if (level == CheckLevel.WARNING) {
            severity = CompilerProtos.Diagnostic.Severity.WARNING;
            warnings.add(error);
        } else {
            return;
        }
        CompilerProtos.Diagnostic.Builder builder = CompilerProtos.Diagnostic.newBuilder();
        builder.setSeverity(severity);
        builder.setMessage(error.getDescription());
        String sourceName = error.getSourceName();
        if (sourceName != null) {
            builder.setFile(sourceName);
            builder.setLine(error.getLineno());
            builder.setColumn(error.getCharno());
        }
        response.addDiagnostic(builder.build());
    }

    @Override
    public void generateReport() { }

    @Override
    public int getErrorCount() {
        return errors.size();
    }

    @Override
    public int getWarningCount() {
        return warnings.size();
    }

    @Override
    public ImmutableList<JSError> getErrors() {
        return ImmutableList.copyOf(errors);
    }

    @Override
    public ImmutableList<JSError> getWarnings() {
        return ImmutableList.copyOf(warnings);
    }

    @Override
    public void setTypedPercent(double typedPercent) {
        this.typedPercent = typedPercent;
    }

    @Override
    public double getTypedPercent() {
        return typedPercent;
    }
}
