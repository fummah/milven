/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		'./index.html',
		'./src/**/*.{js,ts,jsx,tsx}'
	],
	theme: {
		extend: {
			colors: {
				brand: {
					DEFAULT: '#1677ff'
				}
			},
			boxShadow: {
				'xl-soft': '0 20px 40px -12px rgba(0, 0, 0, 0.08)'
			}
		}
	},
	plugins: []
};


