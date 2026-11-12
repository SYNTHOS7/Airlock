import Database from 'better-sqlite3';

const db = new Database('D:/Airlock/data/airlock.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables);

for (const t of tables as any[]) {
  const count = db.prepare(`SELECT count(*) as c FROM "${t.name}"`).get() as any;
  console.log(`- ${t.name}: ${count.c} rows`);
}

console.log('\nAudit events for 17e8a93d-e50c-499a-9973-ff6fe36938a4:');
try {
  const audits = db.prepare('SELECT * FROM audit_log WHERE operation_id = ?').all('17e8a93d-e50c-499a-9973-ff6fe36938a4');
  console.log(audits);
} catch (e: any) {
  console.log('Error querying audit_log:', e.message);
}
