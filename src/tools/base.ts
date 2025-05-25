import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

export abstract class BaseTool {
    constructor(protected readonly server: McpServer) {}

    protected safeValue = (value: any, fallback: string = "undefined"): string => {
        return value !== undefined && value !== null ? String(value) : fallback;
    };

    protected safeArray = (arr: any[]): any[] => {
        return Array.isArray(arr) ? arr : [];
    };

    protected safeNumber = (value: any, fallback: number = 0): number => {
        return typeof value === 'number' && !isNaN(value) ? value : fallback;
    };

    protected safeJoin = (arr: any[], separator: string = ", ", fallback: string = "none"): string => {
        if (!Array.isArray(arr) || arr.length === 0) return fallback;
        return arr.join(separator);
    };

    protected safeHeaders = (headers: any): string => {
        try {
            if (!headers) return "none";
            return JSON.stringify(Object.fromEntries(headers), null, 2);
        } catch (error) {
            return "error parsing headers";
        }
    };

    abstract registerTools(): void;
}