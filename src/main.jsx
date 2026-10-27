import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { OfflineProvider } from './offline/OfflineProvider.jsx';
import { PreferencesProvider } from './settings/PreferencesProvider.jsx';
import './styles.css';
import './modern-overrides.css';
import './styles/accessibility.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PreferencesProvider>
      <OfflineProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App />
        </BrowserRouter>
      </OfflineProvider>
    </PreferencesProvider>
  </React.StrictMode>,
);
