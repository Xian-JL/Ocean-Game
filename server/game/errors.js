"use strict";

class RuleValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RuleValidationError";
    this.code = code;
    this.details = details;
  }
}

function createRuleIssue(code, message, details = {}) {
  return {
    code,
    message,
    ...details,
  };
}

module.exports = {
  RuleValidationError,
  createRuleIssue,
};
