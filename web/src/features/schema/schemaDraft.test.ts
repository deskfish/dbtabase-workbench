import {expect,it} from 'vitest'
import {diffColumns} from './schemaDraft'
it('creates structured add alter rename and drop operations',()=>{const before=[{name:'id',type:'int',nullable:false},{name:'old',type:'text',nullable:true}];const after=[{name:'id',type:'bigint',nullable:false},{name:'new',originalName:'old',type:'text',nullable:true},{name:'title',type:'varchar(50)',nullable:true,isNew:true}];expect(diffColumns(before,after).map(x=>x.kind)).toEqual(['alter_column','rename_column','add_column'])})
