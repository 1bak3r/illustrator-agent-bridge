# Repository Notes

This repo bridges an LLM or browser agent to Adobe Illustrator.

Use these commands before handing off changes:

- `npm run build`
- `npm test`
- `npm run check`

The generated `.jsx` files must stay compatible with Illustrator ExtendScript. Do not use modern JavaScript syntax inside generated Illustrator scripts unless there is a verified host-side reason.

Never commit `.env`, Illustrator MCP bearer keys, generated files under `var/`, or user artwork.
