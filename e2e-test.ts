import * as fs from 'fs';

const currentCode = `
<file path="/App.tsx">
import React from 'react';
import DataTable from './components/DataTable';
import './styles.css';

export default function App() {
  const [data] = React.useState([]);
  return <DataTable data={data} />;
}
</file>

<file path="/components/DataTable.tsx">
import React from 'react';

/* @bindable */
export interface DataTableProps {
  data: { id: string, tags: string }[];
}

export default function DataTable({ data }: DataTableProps) {
  return <div>{data.length}</div>;
}
</file>

<file path="/styles.css">
body { color: red; }
</file>
`;

const llmResponse = `
<file path="/App.tsx">
import React from 'react';
import DataTable from './components/DataTable';
import Papa from 'papaparse';
import { rawData } from './sales.csv.js';
import './styles.css';

function App() {
  return <DataTable data={[]} />;
}
export default App;
</file>
`;

let mergedCode = currentCode;
const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
let match;
while ((match = fileRegex.exec(llmResponse)) !== null) {
  let path = match[1];
  if (!path.startsWith('/')) path = '/' + path;
  
  const newFileContent = \`<file path="\${path}">\${match[2]}</file>\`;
  
  const pathWithoutSlash = path.substring(1);
  const safePathWithSlash = path.replace(/[\\-\\[\\]\\/\\{\\}\\(\\)\\*\\+\\?\\.\\\\\\^\\$\\|]/g, "\\\\$&");
  const safePathWithoutSlash = pathWithoutSlash.replace(/[\\-\\[\\]\\/\\{\\}\\(\\)\\*\\+\\?\\.\\\\\\^\\$\\|]/g, "\\\\$&");
  
  const existingFileRegex = new RegExp(\`<file path="(?:\\${safePathWithSlash}|\\${safePathWithoutSlash})">[\\\\s\\\\S]*?<\\\\/file>\`);
  
  if (existingFileRegex.test(mergedCode)) {
    mergedCode = mergedCode.replace(existingFileRegex, () => newFileContent);
  } else {
    mergedCode += '\\n\\n' + newFileContent;
  }
}

console.log("MERGED CODE:");
console.log(mergedCode);

const files: Record<string, any> = {};
const finalFileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
while ((match = finalFileRegex.exec(mergedCode)) !== null) {
  const path = match[1].startsWith('/') ? match[1] : \`/\${match[1]}\`;
  files[path] = { 
    code: match[2].trim(),
    active: path === '/App.tsx'
  };
}

console.log("FILES EXTRACTED:", Object.keys(files));
