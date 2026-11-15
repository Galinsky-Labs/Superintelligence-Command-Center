// Routes and pages are authored as ES modules (app/**/page.mjs, route.mjs, layout.mjs). Next.js only
// treats files with a listed extension as routes, so without 'mjs' here every route would 404.
export default {pageExtensions:['js','jsx','mjs'],transpilePackages:['@superintelligence/ui'],reactStrictMode:true};
