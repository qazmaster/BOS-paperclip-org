---
name: vercel
description: Complete Vercel CLI reference. Deploy apps, manage projects, domains, environment variables, view logs, and rollback deployments.
---

# Vercel

Deploy and manage applications on Vercel.

## Quick Reference

| Task | Command |
|---|---|
| Deploy | `vercel` or `vercel --prod` |
| Dev server | `vercel dev` |
| Link project | `vercel link` |
| List deployments | `vercel ls` |
| View logs | `vercel logs <url>` |
| Add env var | `vercel env add <name> <env>` |
| Pull env vars | `vercel env pull` |
| Rollback | `vercel rollback` |
| Add domain | `vercel domains add <domain> <project>` |

## Deployment Options

```bash
vercel deploy [path]        # Preview deployment
vercel --prod               # Production deployment
vercel build                # Build locally
vercel dev                  # Local dev server
```

## Environment Variables

```bash
vercel env list [environment]
vercel env add <name> [environment]   # development, preview, production
vercel env pull [filename]
```

## Documentation

```bash
# Fetch any docs page as markdown
curl -s "https://vercel.com/docs/<path>" -H 'accept: text/markdown'
```
