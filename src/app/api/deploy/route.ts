import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { files, name = 'ai-generated-app' } = await req.json();

    const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;
    if (!VERCEL_API_TOKEN) {
      return NextResponse.json(
        { error: 'VERCEL_API_TOKEN is not set in environment variables.' },
        { status: 400 }
      );
    }

    // Convert Sandpack file structure to Vercel deployment files array
    // Sandpack files: { "/App.tsx": { code: "..." }, "/styles.css": { code: "..." } }
    
    const vercelFiles = [];

    // Prefix user files with /src/ 
    for (const [path, fileObj] of Object.entries(files)) {
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      let data = (fileObj as any).code;

      // Inject Tailwind directives into the main CSS file for the Vite build
      if (cleanPath === 'styles.css') {
        data = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n${data}`;
      }

      vercelFiles.push({
        file: `src/${cleanPath}`,
        data
      });
    }

    // Scaffold Vite React App
    vercelFiles.push({
      file: 'package.json',
      data: JSON.stringify({
        name: 'generated-app',
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview'
        },
        dependencies: {
          "react": "^18.2.0",
          "react-dom": "^18.2.0",
          "lucide-react": "^0.292.0",
          "recharts": "^2.10.0",
          "framer-motion": "^11.0.0",
          "react-router-dom": "^6.22.0",
          "react-hook-form": "^7.50.0",
          "zod": "^3.22.0",
          "@hookform/resolvers": "^3.3.0",
          "date-fns": "^3.3.0",
          "@radix-ui/react-dialog": "^1.0.5",
          "@radix-ui/react-dropdown-menu": "^2.0.6",
          "@radix-ui/react-select": "^2.0.0",
          "@radix-ui/react-tabs": "^1.0.4",
          "@radix-ui/react-tooltip": "^1.0.7",
          "@radix-ui/react-switch": "^1.0.3",
          "@radix-ui/react-slider": "^1.1.2",
          "@radix-ui/react-progress": "^1.0.3",
          "@radix-ui/react-avatar": "^1.0.4",
          "@radix-ui/react-checkbox": "^1.0.4",
          "@radix-ui/react-label": "^2.0.2",
          "@radix-ui/react-separator": "^1.0.3",
          "@radix-ui/react-popover": "^1.0.7",
          "@radix-ui/react-accordion": "^1.1.2",
          "@radix-ui/react-alert-dialog": "^1.0.5",
          "@radix-ui/react-toast": "^1.1.5",
          "@headlessui/react": "^2.0.0",
          "clsx": "^2.1.0",
          "uuid": "^9.0.0",
          "class-variance-authority": "^0.7.0"
        },
        devDependencies: {
          "@types/react": "^18.2.43",
          "@types/react-dom": "^18.2.17",
          "@vitejs/plugin-react": "^4.2.1",
          "autoprefixer": "^10.4.17",
          "postcss": "^8.4.33",
          "tailwindcss": "^3.4.1",
          "typescript": "^5.2.2",
          "vite": "^5.0.8"
        }
      }, null, 2)
    });

    vercelFiles.push({
      file: 'vite.config.ts',
      data: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})`
    });

    vercelFiles.push({
      file: 'tailwind.config.js',
      data: `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`
    });

    vercelFiles.push({
      file: 'postcss.config.js',
      data: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`
    });

    vercelFiles.push({
      file: 'index.html',
      data: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Generated App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`
    });

    vercelFiles.push({
      file: 'src/main.tsx',
      data: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`
    });

    // Send to Vercel Deployments API
    const response = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERCEL_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 50) || 'ai-generated-app',
        files: vercelFiles,
        projectSettings: {
          framework: 'vite',
          installCommand: 'npm install',
          buildCommand: 'npm run build',
          outputDirectory: 'dist'
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Vercel deployment failed:', errText);
      return NextResponse.json(
        { error: `Vercel API Error: ${errText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ url: `https://${data.url}` });

  } catch (err: any) {
    console.error('Deployment route error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to deploy to Vercel' },
      { status: 500 }
    );
  }
}
