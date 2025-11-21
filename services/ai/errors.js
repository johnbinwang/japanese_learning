class AiExplainError extends Error {
  constructor(code, message, statusCode = 400, meta = null) {
    super(message);
    this.name = 'AiExplainError';
    this.code = code;
    this.statusCode = statusCode;
    this.meta = meta;
  }
}

module.exports = {
  AiExplainError
};
