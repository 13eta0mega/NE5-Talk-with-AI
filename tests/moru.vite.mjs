import { build } from 'vite';
await build({configFile:false, define:{'process.env.NODE_ENV':JSON.stringify('production')}, esbuild:{jsx:'automatic'}, build:{outDir:'.moru-review',minify:false,lib:{entry:'tests/fixtures/moru.tsx',name:'MoruReview',formats:['iife'],fileName:()=> 'moru-review.js'}}});
