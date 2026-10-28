# Connect Supabase to Codex in VS Code

**Connected and verified on 14 October 2026.** Both the Supabase MCP server and Supabase connector returned ASCEND's project URL, matching the application project `cjridqffhafmxeiiboru`. A read-only MCP SQL query succeeded and confirmed the customer table, chosen owner, migration 14 additions and RLS enabled on all 36 public tables. No business records were changed or emails sent during this check.

No installation or authentication step needs repeating. The steps below are reference instructions for connecting a new Codex session in VS Code through **MCP servers**.

1. Open the **Codex sidebar**, then its **Settings menu**.
2. Select **MCP servers**, then **Add server**.
3. Enter **supabase** as the name and choose **Streamable HTTP**.
4. Paste the project-scoped URL below, then select **Save**.
5. Select **Restart extension** and reopen the MCP server list.
6. Select **Authenticate** for Supabase. In the browser, sign in to the Supabase account that has access to the ASCEND project, choose its organization, and authorize the connection.
7. Return to Codex and ask: **List the ASCEND database tables using Supabase MCP.** A saved entry alone does not verify a working connection.

```text
https://mcp.supabase.com/mcp?project_ref=cjridqffhafmxeiiboru
```

These IDE controls and authentication steps follow [official OpenAI documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Supabase uses browser OAuth, so normal setup needs no personal access token. The URL limits tools to ASCEND's project. Database tools include schema inspection, SQL and migrations; Storage tools require enabling the optional storage feature group. See [Supabase's MCP guide](https://supabase.com/docs/guides/ai-tools/mcp).

The published MCP tool list has no Auth URL/SMTP configuration tool. Those settings need the Supabase Dashboard or separate appropriately scoped Management API credentials. Connecting MCP alone does not configure email or deploy the website. Do not paste passwords or tokens into chat.
