import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import 'antd/dist/reset.css';
import './index.css';
import { SettingsProvider, useSettings } from './contexts/SettingsContext.jsx';

function ThemedApp() {
  const { settings } = useSettings();
  const brandColor = settings['brand.primaryColor'] || '#102540';
  const fontFamily = "'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  return (
    <ConfigProvider theme={{ token: { colorPrimary: brandColor, fontFamily } }}>
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
	<React.StrictMode>
		<SettingsProvider>
			<ThemedApp />
		</SettingsProvider>
	</React.StrictMode>
);


