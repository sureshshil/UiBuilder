'use client';

import { useEffect, useRef } from 'react';
import { useSandpack } from '@codesandbox/sandpack-react';

export default function SandpackErrorListener({ onError, generatedCode }: { onError: (error: string) => void, generatedCode: string }) {
  const { sandpack, listen } = useSandpack();
  const { error } = sandpack;
  const lastReportedError = useRef<string | null>(null);

  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Reset the error tracker when the code changes so we can catch identical errors in new generations
  useEffect(() => {
    lastReportedError.current = null;
  }, [generatedCode]);

  useEffect(() => {
    // Listen for bundler/syntax errors exposed by Sandpack state
    if (error && error.message) {
      if (lastReportedError.current !== error.message) {
        lastReportedError.current = error.message;
        onErrorRef.current(`[Sandpack Error]: ${error.message}`);
      }
    } else {
      // Clear last error if it successfully compiles
      lastReportedError.current = null;
    }
  }, [error]);

  useEffect(() => {
    // Listen to the iframe message channel for runtime errors (like TDZ)
    const unsubscribe = listen((msg) => {
      if (msg.type === 'action' && msg.action === 'show-error') {
        const errorData = (msg as any).error;
        let errorMessage = errorData?.message || (errorData !== undefined ? JSON.stringify(errorData) : 'Unknown Error');
        if (typeof errorMessage !== 'string') errorMessage = String(errorMessage);
        
        // Fix Sandpack Babel worker bug where it wraps SyntaxErrors in TypeErrors
        if (errorMessage.includes("Cannot assign to read only property 'message' of object 'SyntaxError:")) {
           errorMessage = errorMessage.replace("TypeError: Cannot assign to read only property 'message' of object '", "");
           errorMessage = errorMessage.replace(/'\s*$/, ""); // Strip trailing quote
        }

        if (lastReportedError.current !== errorMessage) {
          lastReportedError.current = errorMessage;
          onErrorRef.current(`[Runtime Error]: ${errorMessage}`);
        }
      }
    });
    return unsubscribe;
  }, [listen]);

  return null; // Invisible component
}
