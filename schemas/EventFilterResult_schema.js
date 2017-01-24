const EventFilterResult_Schema = {
    name: "EventFilterResult",
    baseType: "MonitoringFilter", // todo Correct to use?
    fields: [
        { name: "selectClauseResults", isArray: true, fieldType: "StatusCode" },
        { name: "selectClauseDiagnosticInfos", isArray: true, fieldType: "DiagnosticInfo" },
        { name: "whereClauseResult",   fieldType: "ContentFilterResult"}
    ]
};
export {EventFilterResult_Schema};