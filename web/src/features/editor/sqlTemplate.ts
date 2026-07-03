export const SQL_GUIDE='-- 从左侧选择一张表，或在这里输入 SQL'

export function isSqlGuide(sql:string){
  return sql.trim()===SQL_GUIDE
}

export function sqlForSelectedTable(currentSql:string,generatedSql:string){
  return isSqlGuide(currentSql)?generatedSql:currentSql
}
