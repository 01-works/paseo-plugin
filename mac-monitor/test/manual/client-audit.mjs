// 제품 client의 React Native/테마/기본 폰트 제약을 정적 검사한다.
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
const issues=[];
const forbidden=new Set(['document','window','HTMLElement','HTMLDivElement','ResizeObserver','MutationObserver','localStorage','getBoundingClientRect']);
for(const name of readdirSync('client').filter(name=>/\.tsx?$/.test(name))) {
  const file=path.join('client',name), source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  const report=(node,message)=>issues.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line+1} ${message}`);
  const visit=node=>{
    if(ts.isIdentifier(node)&&(forbidden.has(node.text)||node.text==='fontSize')) report(node,'DOM/사용자 지정 폰트');
    if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)) {
      const tag=node.tagName.getText(source);if(/^[a-z]/.test(tag))report(node,'HTML 태그');
      const attributes=node.attributes.properties;
      attributes.forEach(attr=>{if(ts.isJsxAttribute(attr)&&['className','onClick','onMouseEnter','onMouseLeave','dangerouslySetInnerHTML'].includes(attr.name.getText(source)))report(attr,'DOM 속성');});
      if(tag==='Text') {
        const style=attributes.find(attr=>ts.isJsxAttribute(attr)&&attr.name.getText(source)==='style');
        const expression=style?.initializer&&ts.isJsxExpression(style.initializer)?style.initializer.expression:undefined;
        if(!expression||!ts.isObjectLiteralExpression(expression)||!expression.properties.some(prop=>ts.isPropertyAssignment(prop)&&prop.name.getText(source)==='color'))report(node,'Text 색 누락');
      }
    }
    if(ts.isPropertyAssignment(node)&&/color$/i.test(node.name.getText(source))&&ts.isStringLiteral(node.initializer))report(node,'고정 색');
    ts.forEachChild(node,visit);
  };visit(source);
}
console.log(JSON.stringify({issues:issues.length,details:issues}));if(issues.length)process.exitCode=1;
