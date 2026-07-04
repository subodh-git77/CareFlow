const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const models = {};
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const idOf = value => value && typeof value === 'object' && value._id != null ? String(value._id) : String(value);
const equal = (left, right) => idOf(left) === idOf(right);
const dateKeys = new Set(['createdAt', 'updatedAt', 'expiresAt', 'sendAt', 'nextAttemptAt', 'lastAttemptAt']);

const reviveDates = value => {
  if (!value || typeof value !== 'object') return value;
  for (const [key, item] of Object.entries(value)) {
    if (dateKeys.has(key) && item) value[key] = new Date(item);
    else if (item && typeof item === 'object') reviveDates(item);
  }
  return value;
};

const compare = (actual, expected, operator) => {
  const left = actual instanceof Date ? actual.getTime() : actual;
  const right = expected instanceof Date ? expected.getTime() : expected;
  if (operator === '$gt') return left > right;
  if (operator === '$gte') return left >= right;
  if (operator === '$lt') return left < right;
  if (operator === '$lte') return left <= right;
  return false;
};

const matches = (item, query = {}) => Object.entries(query).every(([key, expected]) => {
  const actual = item[key];
  if (expected instanceof RegExp) return expected.test(String(actual || ''));
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
    if ('$in' in expected) return expected.$in.some(value => equal(actual, value));
    if ('$ne' in expected) return !equal(actual, expected.$ne);
    if ('$gt' in expected) return compare(actual, expected.$gt, '$gt');
    if ('$gte' in expected) return compare(actual, expected.$gte, '$gte');
    if ('$lt' in expected) return compare(actual, expected.$lt, '$lt');
    if ('$lte' in expected) return compare(actual, expected.$lte, '$lte');
    if ('$regex' in expected) return new RegExp(expected.$regex, expected.$options || '').test(String(actual || ''));
  }
  return equal(actual, expected);
});

const applyDefaults = (definition, source = {}) => {
  const result = { ...source };
  for (const [key, config] of Object.entries(definition || {})) {
    const isConfig = config && typeof config === 'object' && ('type' in config || 'default' in config || 'required' in config);
    if (isConfig) {
      if (result[key] === undefined && 'default' in config) result[key] = typeof config.default === 'function' ? config.default() : clone(config.default);
    } else if (config && typeof config === 'object' && !Array.isArray(config)) {
      result[key] = applyDefaults(config, result[key] || {});
    }
  }
  return result;
};

const toPlain = value => {
  if (Array.isArray(value)) return value.map(toPlain);
  if (value instanceof Date) return new Date(value);
  if (!value || typeof value !== 'object') return value;
  const plain = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'function' && key !== 'id') plain[key] = toPlain(item);
  }
  return plain;
};

const project = (value, selection) => {
  if (!selection || !value) return value;
  const fields = String(selection).split(/\s+/).filter(Boolean);
  if (fields.some(field => field.startsWith('-'))) {
    const result = { ...value };
    fields.filter(field => field.startsWith('-')).forEach(field => delete result[field.slice(1)]);
    return result;
  }
  const positive = fields.filter(field => !field.startsWith('+'));
  if (!positive.length) return value;
  const result = { _id: value._id };
  positive.forEach(field => { if (value[field] !== undefined) result[field] = value[field]; });
  return result;
};

class MockSchema {
  constructor(definition, options = {}) {
    this.definition = definition;
    this.options = options;
    this.methods = {};
    this.hooks = { pre: {}, post: {} };
  }
  index() {}
  set() {}
  pre(name, fn) { (this.hooks.pre[name] ||= []).push(fn); }
  post(name, fn) { (this.hooks.post[name] ||= []).push(fn); }
}
MockSchema.Types = { ObjectId: class ObjectId {} };

class QueryChain {
  constructor(model, promise) { this.model = model; this.promise = promise; }
  populate(spec, selection) {
    const pathNames = typeof spec === 'string' ? spec.split(/\s+/) : [spec.path];
    const select = typeof spec === 'object' ? spec.select : selection;
    const match = typeof spec === 'object' ? spec.match : null;
    this.promise = this.promise.then(result => {
      const populateItem = item => {
        if (!item) return item;
        for (const field of pathNames) {
          if (!field || !item[field]) continue;
          const rawUser = models.User?.dataList.find(user => equal(user._id, item[field]));
          if (!rawUser || (match && !matches(rawUser, match))) item[field] = null;
          else item[field] = project(toPlain(models.User.createDocument(rawUser, false)), select);
        }
        return item;
      };
      return Array.isArray(result) ? result.map(populateItem) : populateItem(result);
    });
    return this;
  }
  select(selection) {
    this.promise = this.promise.then(result => Array.isArray(result)
      ? result.map(item => project(item, selection))
      : project(result, selection));
    return this;
  }
  sort(criteria) {
    this.promise = this.promise.then(result => {
      if (!Array.isArray(result)) return result;
      const entries = Object.entries(criteria);
      return [...result].sort((a, b) => {
        for (const [key, direction] of entries) {
          if (a[key] < b[key]) return -1 * direction;
          if (a[key] > b[key]) return 1 * direction;
        }
        return 0;
      });
    });
    return this;
  }
  limit(count) { this.promise = this.promise.then(result => Array.isArray(result) ? result.slice(0, count) : result); return this; }
  lean() { this.promise = this.promise.then(result => toPlain(result)); return this; }
  then(resolve, reject) { return this.promise.then(resolve, reject); }
  catch(reject) { return this.promise.catch(reject); }
  exec() { return this.promise; }
}

class MockModel {
  constructor(name, schema) {
    this.name = name;
    this.schema = schema;
    this.filePath = path.join(DATA_DIR, `${name.toLowerCase()}.json`);
    this.dataList = this.load();
  }
  load() {
    if (!fs.existsSync(this.filePath)) return [];
    try { return reviveDates(JSON.parse(fs.readFileSync(this.filePath, 'utf8'))); }
    catch (_error) { return []; }
  }
  persist() { fs.writeFileSync(this.filePath, JSON.stringify(this.dataList, null, 2), 'utf8'); }
  duplicateError(message) { const error = new Error(message); error.code = 11000; return error; }
  assertUnique(candidate, ignoreId = null) {
    const other = predicate => this.dataList.find(item => (!ignoreId || !equal(item._id, ignoreId)) && predicate(item));
    if (this.name === 'User' && other(item => item.email === candidate.email)) throw this.duplicateError('Email already exists');
    if (this.name === 'DoctorProfile' && other(item => equal(item.userId, candidate.userId))) throw this.duplicateError('Doctor profile already exists');
    if (this.name === 'Appointment' && candidate.active && other(item => item.active && equal(item.doctorId, candidate.doctorId) && item.date === candidate.date && item.slotTime === candidate.slotTime)) throw this.duplicateError('Slot already booked');
    if (this.name === 'SlotHold' && other(item => equal(item.doctorId, candidate.doctorId) && item.slotDate === candidate.slotDate && item.slotTime === candidate.slotTime)) throw this.duplicateError('Slot already held');
    if (this.name === 'Prescription' && other(item => equal(item.appointmentId, candidate.appointmentId))) throw this.duplicateError('Prescription already exists');
    if (this.name === 'CalendarEvent' && other(item => equal(item.appointmentId, candidate.appointmentId))) throw this.duplicateError('Calendar event already exists');
    if (this.name === 'NotificationLog' && candidate.dedupeKey && other(item => item.dedupeKey === candidate.dedupeKey)) throw this.duplicateError('Notification already queued');
  }
  async runPreSave(doc) {
    for (const hook of this.schema.hooks.pre.save || []) {
      await new Promise((resolve, reject) => hook.call(doc, error => error ? reject(error) : resolve()));
    }
  }
  createDocument(raw, isNew = false) {
    if (!raw) return null;
    const model = this;
    const doc = reviveDates(clone(raw));
    Object.defineProperty(doc, '__original', { value: clone(raw), writable: true, enumerable: false });
    Object.defineProperty(doc, 'id', { get: () => doc._id, enumerable: false });
    doc.isModified = field => isNew || JSON.stringify(doc[field]) !== JSON.stringify(doc.__original[field]);
    for (const [name, method] of Object.entries(this.schema.methods)) doc[name] = method.bind(doc);
    doc.toObject = () => toPlain(doc);
    doc.toJSON = () => toPlain(doc);
    doc.populate = async (field, selection) => {
      if (!doc[field]) return doc;
      const rawUser = models.User?.dataList.find(user => equal(user._id, doc[field]));
      if (rawUser) doc[field] = project(toPlain(models.User.createDocument(rawUser, false)), selection);
      return doc;
    };
    doc.save = async () => {
      await model.runPreSave(doc);
      const now = new Date();
      if (model.schema.options.timestamps) {
        doc.createdAt ||= now;
        doc.updatedAt = now;
      }
      model.assertUnique(doc, doc._id);
      const index = model.dataList.findIndex(item => equal(item._id, doc._id));
      const stored = reviveDates(toPlain(doc));
      if (index >= 0) model.dataList[index] = stored; else model.dataList.push(stored);
      doc.__original = clone(stored);
      model.persist();
      return doc;
    };
    return doc;
  }
  find(query = {}) { return new QueryChain(this, Promise.resolve(this.dataList.filter(item => matches(item, query)).map(item => this.createDocument(item)))); }
  findOne(query = {}) { return new QueryChain(this, Promise.resolve(this.createDocument(this.dataList.find(item => matches(item, query))))); }
  findById(id) { return this.findOne({ _id: id }); }
  async exists(query = {}) { const found = this.dataList.find(item => matches(item, query)); return found ? { _id: found._id } : null; }
  async create(input) {
    if (Array.isArray(input)) { const result = []; for (const item of input) result.push(await this.create(item)); return result; }
    const now = new Date();
    const data = applyDefaults(this.schema.definition, input);
    data._id ||= `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
    if (this.schema.options.timestamps) { data.createdAt ||= now; data.updatedAt ||= now; }
    const doc = this.createDocument(data, true);
    await this.runPreSave(doc);
    this.assertUnique(doc);
    this.dataList.push(reviveDates(toPlain(doc)));
    doc.__original = clone(doc);
    this.persist();
    return doc;
  }
  async insertMany(items) { const result = []; for (const item of items) result.push(await this.create(item)); return result; }
  async deleteMany(query = {}) { const before = this.dataList.length; this.dataList = this.dataList.filter(item => !matches(item, query)); this.persist(); return { deletedCount: before - this.dataList.length }; }
  async deleteOne(query = {}) { const index = this.dataList.findIndex(item => matches(item, query)); if (index < 0) return { deletedCount: 0 }; this.dataList.splice(index, 1); this.persist(); return { deletedCount: 1 }; }
  async updateMany(query, update) {
    let count = 0;
    for (const item of this.dataList) {
      if (!matches(item, query)) continue;
      Object.assign(item, update.$set || update);
      if (this.schema.options.timestamps) item.updatedAt = new Date();
      count += 1;
    }
    this.persist();
    return { matchedCount: count, modifiedCount: count };
  }
  async findOneAndDelete(query) { const index = this.dataList.findIndex(item => matches(item, query)); if (index < 0) return null; const [item] = this.dataList.splice(index, 1); this.persist(); return this.createDocument(item); }
  async findOneAndUpdate(query, update, options = {}) {
    const index = this.dataList.findIndex(item => matches(item, query));
    if (index < 0) {
      if (!options.upsert) return null;
      return this.create({ ...query, ...(update.$set || update) });
    }
    const merged = { ...this.dataList[index], ...(update.$set || update) };
    if (this.schema.options.timestamps) merged.updatedAt = new Date();
    this.assertUnique(merged, merged._id);
    this.dataList[index] = merged;
    this.persist();
    return this.createDocument(options.new === false ? this.dataList[index] : merged);
  }
}

const mockMongoose = {
  Schema: MockSchema,
  Types: { ObjectId: value => value || `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}` },
  model(name, schema) { return models[name] ||= new MockModel(name, schema); },
  set() {},
  async connect() { mockMongoose.connection.readyState = 1; console.log(`[Database] Local JSON development database: ${DATA_DIR}`); return mockMongoose; },
  async disconnect() { mockMongoose.connection.readyState = 0; },
  connection: { readyState: 0 }
};

module.exports = mockMongoose;