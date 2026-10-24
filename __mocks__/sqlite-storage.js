const events = new Map();
const database = {
  async executeSql(sql, params = []) {
    if (sql.startsWith('INSERT OR IGNORE')) {
      if (!events.has(params[0])) events.set(params[0], { received_at_ms: params[5], payload: params[6] });
    } else if (sql.startsWith('DELETE FROM events WHERE')) {
      const newest = [...events.entries()].sort((a, b) => b[1].received_at_ms - a[1].received_at_ms).slice(0, 500);
      events.clear(); newest.forEach(([id, value]) => events.set(id, value));
    } else if (sql === 'DELETE FROM events') {
      events.clear();
    } else if (sql.startsWith('SELECT payload')) {
      const records = [...events.values()].sort((a, b) => b.received_at_ms - a.received_at_ms).slice(0, 500);
      return [{ rows: { length: records.length, item: index => records[index] } }];
    }
    return [{ rows: { length: 0, item: () => undefined } }];
  },
};
exports.enablePromise = () => {};
exports.openDatabase = async () => database;
