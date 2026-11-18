# Tasks

- [x] 1.1 Add `"engines": { "node": ">=22" }` to `package.json`
  - proof: `node -e "const e=require('./package.json').engines.node; console.log(e); process.exit(e==='>=22'?0:1)"`
  - proof: `npm test`
