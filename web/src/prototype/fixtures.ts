import type { ConnectionFixture, DataColumn, DataRow, DatabaseFixture, TableFixture, TeamConnectionFixture } from './model'

export const personalConnections: ConnectionFixture[] = [
  {id:'conn-1',name:'10.10.80.122_pg',driver:'PostgreSQL',host:'10.10.80.122',database:'flybase',connected:true,shared:true},
  {id:'conn-2',name:'192.168.6.100',driver:'PostgreSQL',host:'192.168.6.100',database:'channelHub'},
  {id:'conn-3',name:'192.168.6.105',driver:'PostgreSQL',host:'192.168.6.105',database:'channelHub'},
]

export const databases: DatabaseFixture[] = [
  {name:'channelHub'}, {name:'configuration',selected:true}, {name:'conversationKit'},
  {name:'externalKit'}, {name:'flySense'}, {name:'flybase'},
]

export const tables: TableFixture[] = [
  {schema:'public',name:'conversation_record',rows:12568},
  {schema:'public',name:'anti_spam_config',rows:38},
  {schema:'public',name:'fallback_messages',rows:124},
  {schema:'public',name:'holiday_daily_detail',rows:365},
  {schema:'public',name:'holiday_rule_config',rows:42},
  {schema:'public',name:'message_template',rows:86},
  {schema:'public',name:'msg_blacklist',rows:301},
  {schema:'public',name:'system_config',rows:74},
]

export const teamConnections: TeamConnectionFixture[] = [
  {...personalConnections[0],owner:'小明星',team:'数据团队',syncedAt:'5 分钟前'},
  {...personalConnections[1],owner:'孙振东',team:'研发团队',syncedAt:'12 分钟前'},
  {...personalConnections[2],owner:'孙振东',team:'研发团队',syncedAt:'今天 10:24',copied:true},
  {id:'team-4',name:'report_readonly',driver:'PostgreSQL',host:'10.10.90.18',database:'reports',owner:'数据团队',team:'数据团队',syncedAt:'昨天'},
  {id:'team-5',name:'bi_analytics',driver:'PostgreSQL',host:'10.10.90.20',database:'analytics',owner:'数据团队',team:'数据团队',syncedAt:'2 天前'},
  {id:'team-6',name:'dev_test_env',driver:'PostgreSQL',host:'10.10.90.21',database:'testdb',owner:'运维团队',team:'运维团队',syncedAt:'3 天前'},
]

export const dataColumns: DataColumn[] = [
  {key:'id',label:'id',type:'INT8',width:160},
  {key:'request_client_id',label:'request_client_id',type:'VARCHAR',width:180},
  {key:'request_message_ids',label:'request_message_ids',type:'TEXT',width:190},
  {key:'union_msg_id',label:'union_msg_id',type:'VARCHAR',width:150},
  {key:'request_texts',label:'request_texts',type:'TEXT',width:190},
  {key:'response_text',label:'response_text',type:'TEXT',width:210},
  {key:'media_data',label:'media_data',type:'INT2',width:110},
  {key:'message_status',label:'message_status',type:'INT2',width:120},
  {key:'process_status',label:'process_status',type:'INT2',width:120},
  {key:'created_time',label:'created_time',type:'TIMESTAMPTZ',width:190},
]

const prompts = ['请帮我查询订单物流信息','最新的产品价格是多少','生成一张销售报表','导出本月数据','你好','查询库存','天气怎么样','帮我订一张机票']
export const dataRows: DataRow[] = Array.from({length:20},(_,index)=>({
  id:1256893401123456789 + index,
  request_client_id:`a${index+1}b2c3d4-5678-9a0b`,
  request_message_ids:`["m${index+1}","m${index+2}"]`,
  union_msg_id:`u-${10001+index}`,
  request_texts:prompts[index%prompts.length],
  response_text:index%3===0?'好的，已经为您查询到相关信息。':'数据处理完成，请查看结果。',
  media_data:index%4===0?null:1,
  message_status:index%2+1,
  process_status:index%3===0?2:1,
  created_time:`2025-06-01 12:${String(31+index).padStart(2,'0')}:22`,
}))
