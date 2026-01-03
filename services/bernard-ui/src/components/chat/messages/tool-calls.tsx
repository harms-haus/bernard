import type { AIMessage } from '@langchain/langgraph-sdk';

function isComplexValue(value: any): boolean {
  return Array.isArray(value) || (typeof value === 'object' && value !== null);
}

export function ToolCalls({ toolCalls }: { toolCalls: AIMessage['tool_calls'] }) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="space-y-4 w-full max-w-4xl">
      {toolCalls.map((tc, idx) => {
        const args = tc.args as Record<string, any>;
        const hasArgs = Object.keys(args).length > 0;
        return (
          <div key={idx} className="border border-border rounded-lg overflow-hidden">
            <div className="bg-muted px-4 py-2 border-b border-border">
              <h3 className="font-medium">
                {tc.name}
                {tc.id && (
                  <code className="ml-2 text-sm bg-background px-2 py-1 rounded">{tc.id}</code>
                )}
              </h3>
            </div>
            {hasArgs ? (
              <table className="min-w-full divide-y divide-border">
                <tbody className="divide-y divide-border">
                  {Object.entries(args).map(([key, value], argIdx) => (
                    <tr key={argIdx}>
                      <td className="px-4 py-2 text-sm font-medium">{key}</td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        {isComplexValue(value) ? (
                          <code className="bg-muted rounded px-2 py-1 font-mono text-sm break-all">
                            {JSON.stringify(value, null, 2)}
                          </code>
                        ) : (
                          String(value)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <code className="text-sm block p-3">{"{}"}</code>
            )}
          </div>
        );
      })}
    </div>
  );
}
