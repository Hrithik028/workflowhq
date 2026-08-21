const { AppError } = require("../lib/errors");

const validate = (schemas) => (req, _res, next) => {
  for (const source of ["params", "query", "body"]) {
    if (!schemas[source]) {
      continue;
    }

    const result = schemas[source].safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message
      }));
      return next(
        new AppError(400, "VALIDATION_ERROR", "Please check the submitted values.", details)
      );
    }

    req[source] = result.data;
  }

  return next();
};

module.exports = { validate };
