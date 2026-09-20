export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestions?: string[];
}

export interface BindableContract {
  name: string;
  propsInterface: string;
  codeSnippet: string;
}

export const CopilotService = {
  /**
   * Extracts components marked with /* @bindable *\/ and their prop interfaces using pure TS Regex.
   */
  extractBindableContracts: (code: string): BindableContract[] => {
    const contracts: BindableContract[] = [];
    
    // Regex to find /* @bindable */ followed by an interface and component
    // We look for the interface definition and the component function.
    const lines = code.split('\n');
    let isBindable = false;
    let currentContract: Partial<BindableContract> = {};
    let interfaceLines: string[] = [];
    let insideInterface = false;

    // A simple parser to extract the closest interface and component name
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('/* @bindable */') || line.includes('// @bindable')) {
        isBindable = true;
        currentContract = { codeSnippet: '' };
        interfaceLines = [];
        continue;
      }

      if (isBindable) {
        if (line.includes('interface ') || line.includes('type ')) {
          insideInterface = true;
          // Extract name
          const match = line.match(/(?:interface|type)\s+([A-Za-z0-9_]+)/);
          if (match) currentContract.name = match[1].replace('Props', '');
        }

        if (insideInterface) {
          interfaceLines.push(line);
          if (line.includes('}')) {
            insideInterface = false;
            currentContract.propsInterface = interfaceLines.join('\n');
          }
        }

        if (!insideInterface && (line.includes('function ') || line.includes('const '))) {
          // If we found a component declaration, finalize this contract
          const match = line.match(/(?:function|const)\s+([A-Za-z0-9_]+)/);
          if (match && !currentContract.name) {
            currentContract.name = match[1];
          }
          currentContract.codeSnippet = (currentContract.propsInterface || '') + '\n' + line;
          if (currentContract.name && currentContract.propsInterface) {
            contracts.push(currentContract as BindableContract);
          }
          isBindable = false;
        }
      }
    }
    
    // Fallback block-level regex approach if line-by-line misses
    if (contracts.length === 0) {
      const bindableRegex = /\/\*\s*@bindable\s*\*\/\s*(?:export\s+)?interface\s+([A-Za-z0-9_]+)Props\s*\{([^}]+)\}\s*(?:export\s+)?(?:function|const)\s+([A-Za-z0-9_]+)/g;
      let match;
      while ((match = bindableRegex.exec(code)) !== null) {
        contracts.push({
          name: match[3],
          propsInterface: `interface ${match[1]}Props {${match[2]}}`,
          codeSnippet: match[0]
        });
      }
    }

    return contracts;
  },

  /**
   * Sends a standard generation chat message to the AI.
   */
  generateUI: async (messages: ChatMessage[], currentCode: string, uploadedSchema?: any): Promise<string> => {
    const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
    let finalContent = apiMessages[apiMessages.length - 1].content;
    
    if (uploadedSchema) {
      const fileName = uploadedSchema.filename;
      finalContent += `\n\n[Uploaded Data]:\nFilename: ${fileName}\nColumns: ${JSON.stringify(uploadedSchema.columns)}\nSample rows (for reference — load the real file for the full dataset, do not just use this sample):\n${JSON.stringify(uploadedSchema.rows?.slice(0, 5), null, 2)}\n\n(IMPORTANT: Load the REAL data at runtime, do not hardcode mock data. The file is in the sandbox next to /App.tsx. Import it as a URL: \`import dataUrl from './${fileName}';\` then inside a useEffect: \`fetch(dataUrl).then(res => res.text())\` (or \`.json()\` if it's a .json file). Do NOT fetch a plain path like '/${fileName}' — only the imported URL resolves. If it's CSV/TSV, parse the fetched text with papaparse: \`Papa.parse(text, { header: true }).data\`.)`;
    }
    
    if (currentCode) {
      finalContent += `\n\n[Current Code (use as starting point if modifying)]:\n${currentCode}`;
    }
    
    apiMessages[apiMessages.length - 1].content = finalContent;

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: apiMessages }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    
    let fullCode = await response.text();
    if (fullCode.startsWith('\`\`\`')) fullCode = fullCode.replace(/^\`\`\`[a-z]*\n?/, '');
    if (fullCode.endsWith('\`\`\`')) fullCode = fullCode.replace(/\n?\`\`\`$/, '');
    
    return fullCode.trim();
  },

  /**
   * Calls the specialized cheaper model endpoint to generate the binding adapter.
   */
  generateDataBinding: async (
    userInstruction: string,
    componentContracts: BindableContract[],
    dataSchema: any,
    currentCode: string
  ): Promise<string> => {
    const response = await fetch('/api/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction: userInstruction,
        contracts: componentContracts,
        schema: dataSchema,
        currentCode
      }),
    });

    if (!response.ok) throw new Error(`Binding API error: ${response.status}`);
    
    let code = await response.text();
    if (code.startsWith('\`\`\`')) code = code.replace(/^\`\`\`[a-z]*\n?/, '');
    if (code.endsWith('\`\`\`')) code = code.replace(/\n?\`\`\`$/, '');
    code = code.trim();

    // Merge the modified files back into currentCode to prevent losing other files
    let mergedCode = currentCode;
    const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
    let match;
    let didMerge = false;
    while ((match = fileRegex.exec(code)) !== null) {
      didMerge = true;
      let path = match[1];
      if (!path.startsWith('/')) path = '/' + path; // Normalize leading slash
      
      const newFileContent = `<file path="${path}">${match[2]}</file>`;
      
      const pathWithoutSlash = path.substring(1);
      const safePathWithSlash = path.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
      const safePathWithoutSlash = pathWithoutSlash.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
      
      const existingFileRegex = new RegExp(`<file path="(?:${safePathWithSlash}|${safePathWithoutSlash})">[\\s\\S]*?<\\/file>`);
      
      if (existingFileRegex.test(mergedCode)) {
        // Use a replacer function to prevent '$' characters in React code from being evaluated as regex replacements!
        mergedCode = mergedCode.replace(existingFileRegex, () => newFileContent);
      } else {
        mergedCode += '\n\n' + newFileContent;
      }
    }

    // If no valid XML tags were returned, fallback to returning the whole thing (just in case)
    return didMerge ? mergedCode : code;
  },

  /**
   * Calls the suggest endpoint based on data schema.
   */
  getSuggestions: async (schema: any): Promise<string[]> => {
    const res = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema })
    });
    if (!res.ok) throw new Error('Failed to fetch suggestions');
    const data = await res.json();
    return data.suggestions || [];
  }
};
