# Support

Use GitHub issues for reproducible bridge bugs, focused feature requests,
runtime-profile gaps, source protocol compatibility reports, usage questions,
and documentation problems.

Before opening an issue:

1. Check the README, runtime profile docs, client path docs, and message
   contract for the expected bridge and Knowledge Source behavior.
2. Try the smallest public reproduction that does not include credentials,
   private endpoint URLs, private runtime URLs, raw sensitive source content, or
   screenshots exposing private infrastructure.
3. Use the issue form that matches the request.

Include the package version or commit, Node.js version, operating system,
runtime profile, runtime endpoint type, Knowledge Source protocol, source URL
policy, and sanitized request/response snippets when relevant.

This project is a generic companion runtime bridge with Hermes, DeepAgents, and generic OpenAI-compatible profiles for LLMWiki Knowledge Sources. It does not provide hosted infrastructure, managed vector storage, or support for unrelated RAG application stacks.

For vulnerabilities, follow [SECURITY.md](./SECURITY.md) instead of opening a detailed public issue.
