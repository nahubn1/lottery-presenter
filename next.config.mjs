/**
 * @type {import('next').NextConfig}
 *
 * By specifying `output: 'export'` we opt in to Next.js' static export mode. This
 * means the site will be compiled down to a set of HTML, JS and CSS files in
 * the `out` directory after running `npm run build`. The `images.unoptimized`
 * flag prevents Next.js from attempting to process images at build time
 * without a server, which isn't needed for this project.
 */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
