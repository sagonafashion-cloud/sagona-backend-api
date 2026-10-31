// Makes a schema insert-only: any update/delete through Mongoose is rejected.
// (This protects against accidental or buggy code paths. It is not a substitute
// for database-level permissions; direct DB access can still modify documents.)
const BLOCKED = [
  'updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne',
  'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndRemove'
];

export function makeAppendOnly(schema, label) {
  for (const op of BLOCKED) {
    schema.pre(op, function () {
      throw new Error(`${label} is append-only: ${op} is not allowed`);
    });
  }
  schema.pre('save', function (next) {
    if (!this.isNew) return next(new Error(`${label} is append-only: existing records cannot be modified`));
    next();
  });
  schema.pre('deleteOne', { document: true, query: false }, function () {
    throw new Error(`${label} is append-only: delete is not allowed`);
  });
}
