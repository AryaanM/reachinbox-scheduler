import { useState, useEffect } from 'react';
import axios from 'axios';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';

// NOTE: In a real app, put this Client ID in a .env file
const GOOGLE_CLIENT_ID = "153107690376-5gsa2ihb5604h3b9m1jminrg1a27cno8.apps.googleusercontent.com"; 

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    subject: '', body: '', startTime: '', delayMs: 2000, slackWebhook: ''
  });
  const [parsedEmails, setParsedEmails] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'scheduled' | 'sent'>('scheduled');

  const fetchLogs = async () => {
    if (!user) return;
    try {
      const res = await axios.get('http://localhost:4000/api/logs');
      setLogs(res.data);
    } catch (error) {
      console.error("Failed to fetch logs");
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const emails = text.split(/[\n,]+/).map(e => e.trim()).filter(e => e.includes('@'));
      setParsedEmails(emails);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedEmails.length === 0) {
      setStatus({ type: 'error', text: 'Please upload valid email addresses.' });
      return;
    }
    setLoading(true);
    setStatus(null);
    
    try {
      await axios.post('http://localhost:4000/api/schedule', {
        userId: user.sub,
        senderEmail: user.email, // Use authenticated Google email
        targets: parsedEmails,
        subject: formData.subject,
        body: formData.body,
        startTime: formData.startTime,
        delayMs: Number(formData.delayMs),
        slackWebhook: formData.slackWebhook
      });
      setStatus({ type: 'success', text: 'Campaign scheduled successfully!' });
      setFormData({ ...formData, subject: '', body: '' });
      setParsedEmails([]);
      setFileName('');
      fetchLogs();
    } catch (error) {
      setStatus({ type: 'error', text: 'Failed to schedule campaign.' });
    } finally {
      setLoading(false);
    }
  };

  const displayedLogs = logs.filter(log => activeTab === 'sent' ? log.status === 'SENT' : log.status !== 'SENT');

  // LOGIN SCREEN
  if (!user) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
          <div className="bg-white p-8 rounded-xl shadow-md border border-gray-100 text-center max-w-md w-full">
            <h1 className="text-3xl font-bold mb-2">ReachInbox</h1>
            <p className="text-gray-500 mb-8">Sign in to manage your email campaigns</p>
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={(credentialResponse) => {
                  if (credentialResponse.credential) {
                    const decoded = jwtDecode(credentialResponse.credential);
                    setUser(decoded);
                  }
                }}
                onError={() => console.log('Login Failed')}
              />
            </div>
          </div>
        </div>
      </GoogleOAuthProvider>
    );
  }

  // MAIN DASHBOARD
  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-xl font-bold">ReachInbox</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">{user.name}</span>
          <img src={user.picture} alt="Avatar" className="w-8 h-8 rounded-full border border-gray-200" />
          <button onClick={() => setUser(null)} className="text-sm text-red-600 hover:text-red-800 font-medium ml-2">Logout</button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto space-y-8 p-8">
        {/* Form Section */}
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-2xl font-bold mb-6">Compose New Campaign</h2>
          {status && (
            <div className={`p-4 mb-6 rounded ${status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {status.text}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Schedule Time</label>
                <input required type="datetime-local" className="w-full p-2 border rounded" value={formData.startTime} onChange={e => setFormData({...formData, startTime: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Slack Alert Webhook (Optional)</label>
                <input type="url" className="w-full p-2 border rounded" placeholder="https://hooks.slack.com/..." value={formData.slackWebhook} onChange={e => setFormData({...formData, slackWebhook: e.target.value})} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Upload Leads (CSV or TXT)</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center bg-gray-50 relative">
                <input type="file" accept=".csv, .txt" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                {fileName ? (
                  <div className="text-center">
                    <p className="text-blue-600 font-medium mb-1">{fileName}</p>
                    <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">{parsedEmails.length} valid emails detected</span>
                  </div>
                ) : (
                  <p className="text-gray-500">Drag and drop or click to upload</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Subject & Body</label>
              <input required type="text" className="w-full p-2 border rounded mb-2" placeholder="Subject" value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} />
              <textarea required className="w-full p-2 border rounded h-24" placeholder="Email body..." value={formData.body} onChange={e => setFormData({...formData, body: e.target.value})} />
            </div>
            
            <div className="flex justify-between items-center">
              <div className="flex gap-2 items-center text-sm">
                <label>Throttle Delay (ms):</label>
                <input type="number" className="w-20 p-1 border rounded" value={formData.delayMs} onChange={e => setFormData({...formData, delayMs: parseInt(e.target.value)})} />
              </div>
              <button type="submit" disabled={loading || parsedEmails.length === 0} className="bg-blue-600 text-white px-6 py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Scheduling...' : 'Schedule Campaign'}
              </button>
            </div>
          </form>
        </div>

        {/* Tabbed Logs Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-200">
            <button onClick={() => setActiveTab('scheduled')} className={`flex-1 py-4 font-semibold text-center ${activeTab === 'scheduled' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}>
              Scheduled Emails
            </button>
            <button onClick={() => setActiveTab('sent')} className={`flex-1 py-4 font-semibold text-center ${activeTab === 'sent' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:bg-gray-50'}`}>
              Sent Emails
            </button>
          </div>
          
          <div className="p-8">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="p-3 text-sm font-semibold">Target</th>
                  <th className="p-3 text-sm font-semibold">Subject</th>
                  <th className="p-3 text-sm font-semibold">{activeTab === 'sent' ? 'Sent Time' : 'Scheduled For'}</th>
                  <th className="p-3 text-sm font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayedLogs.map((log) => (
                  <tr key={log.id} className="border-b text-sm">
                    <td className="p-3">{log.targetEmail}</td>
                    <td className="p-3 truncate max-w-xs">{log.subject}</td>
                    <td className="p-3">{new Date(log.scheduledAt).toLocaleString()}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        log.status === 'SENT' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {displayedLogs.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-gray-500 font-medium">No emails found in this tab.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}