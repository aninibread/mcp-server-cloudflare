import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createMcpHandler, McpAgent } from 'agents/mcp'

import { getEnv } from '@repo/mcp-common/src/env'
import { registerPrompts } from '@repo/mcp-common/src/prompts/docs-vectorize.prompts'
import { initSentry } from '@repo/mcp-common/src/sentry'
import { CloudflareMCPServer } from '@repo/mcp-common/src/server'
import { registerDocsTools } from '@repo/mcp-common/src/tools/docs-vectorize.tools'

import type { Env } from './docs-vectorize.context'

const env = getEnv<Env>()

// The docs MCP server isn't stateful, so we don't have state/props
export type Props = never

export type State = never

export class CloudflareDocumentationMCP extends McpAgent<Env, State, Props> {
	_server: CloudflareMCPServer | undefined
	set server(server: CloudflareMCPServer) {
		this._server = server
	}
	get server(): CloudflareMCPServer {
		if (!this._server) {
			throw new Error('Tried to access server before it was initialized')
		}

		return this._server
	}

	constructor(
		public ctx: DurableObjectState,
		public env: Env
	) {
		super(ctx, env)
	}

	async init() {
		const sentry = initSentry(env, this.ctx)

		this.server = new CloudflareMCPServer({
			wae: env.MCP_METRICS,
			serverInfo: {
				name: env.MCP_SERVER_NAME,
				version: env.MCP_SERVER_VERSION,
			},
			sentry,
		})

		registerDocsTools(this.server, this.env)
		registerPrompts(this.server)
	}
}

const sseHandler = CloudflareDocumentationMCP.serveSSE('/sse')

const statelessServer = new McpServer({
	name: env.MCP_SERVER_NAME,
	version: env.MCP_SERVER_VERSION,
})

registerDocsTools(statelessServer, env)
registerPrompts(statelessServer)

const mcpHandler = createMcpHandler(statelessServer)

export default {
	fetch: async (req: Request, env: unknown, ctx: ExecutionContext) => {
		const url = new URL(req.url)
		if (url.pathname === '/sse' || url.pathname === '/sse/message') {
			return sseHandler.fetch(req, env, ctx)
		}
		if (url.pathname === '/mcp') {
			return mcpHandler(req, env, ctx)
		}
		return new Response('Not found', { status: 404 })
	},
}
