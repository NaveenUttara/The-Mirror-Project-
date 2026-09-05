'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import './mirror.css';

type PageId = 'home' | 'login' | 'dashboard' | 'report' | 'success' | 'impact';
type LegalType = 'terms' | 'privacy';
type LocationPermissionState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';
type CitizenReport = {
    reportId: string;
    potholePublicId: string;
    latitude: number;
    longitude: number;
    severity: string;
    status: string;
    submittedAt: string;
    photoUrl: string | null;
};

function ReportPhoto({ photoUrl, token, reportId }: { photoUrl: string; token: string; reportId: string }) {
    const [source, setSource] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        let objectUrl = '';

        void fetch(photoUrl, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
        })
            .then((response) => {
                if (!response.ok) throw new Error('Photograph could not be loaded');
                return response.blob();
            })
            .then((blob) => {
                objectUrl = URL.createObjectURL(blob);
                setSource(objectUrl);
            })
            .catch((error) => {
                if (error instanceof DOMException && error.name === 'AbortError') return;
                console.error(error);
            });

        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [photoUrl, token]);

    return source
        ? <Image className="report-photo" src={source} alt={`Pothole evidence for report ${reportId}`} width={88} height={68} unoptimized />
        : <div className="report-photo report-photo-loading" aria-label="Loading report photograph">Loading photo…</div>;
}

export default function Home() {
    const [currentPage, setCurrentPage] = useState<PageId>('home');
    const [phone, setPhone] = useState('');
    const [phoneConsent, setPhoneConsent] = useState(false);
    const [otp, setOtp] = useState('');
    const [showOtpBox, setShowOtpBox] = useState(false);
    const [showProfileBox, setShowProfileBox] = useState(false);
    const [profileName, setProfileName] = useState('');
    const [profileEmail, setProfileEmail] = useState('');
    const [authBusy, setAuthBusy] = useState(false);
    const [authToken, setAuthToken] = useState(() =>
        typeof window === 'undefined' ? '' : window.localStorage.getItem('token') || ''
    );
    const [userName, setUserName] = useState('Citizen');
    const [reports, setReports] = useState<CitizenReport[]>([]);
    const [reportsBusy, setReportsBusy] = useState(false);
    const [severity, setSeverity] = useState('Medium');
    const [description, setDescription] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
    const [photoCapturedAt, setPhotoCapturedAt] = useState('');
    const [locationCapturedAt, setLocationCapturedAt] = useState('');
    const [locationBusy, setLocationBusy] = useState(false);
    const [locationPermissionState, setLocationPermissionState] = useState<LocationPermissionState>('idle');
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoConsent, setPhotoConsent] = useState(false);
    const [reportBusy, setReportBusy] = useState(false);
    const [latestReportId, setLatestReportId] = useState('');
    const [legalType, setLegalType] = useState<LegalType | null>(null);
    const [toastMessage, setToastMessage] = useState('');
    const [toastVisible, setToastVisible] = useState(false);
    const photoInputRef = useRef<HTMLInputElement>(null);

    const showToast = (message: string) => {
        setToastMessage(message);
        setToastVisible(true);
        window.setTimeout(() => setToastVisible(false), 2600);
    };

    const showPage = (page: PageId) => {
        setCurrentPage(page);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const loadReports = async (token = authToken) => {
        if (!token) {
            return;
        }

        setReportsBusy(true);
        try {
            const response = await fetch('/api/reports', {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showToast(data.error || 'Could not load your reports');
                return;
            }
            setReports(data.reports || []);
            setUserName(data.user?.name || 'Citizen');
        } catch (error) {
            console.error(error);
            showToast('Network error while loading reports');
        } finally {
            setReportsBusy(false);
        }
    };

    const openDashboard = () => {
        if (!authToken) {
            showPage('login');
            showToast('Please sign in to view your reports');
            return;
        }
        showPage('dashboard');
        void loadReports();
    };

    const handleSendOtp = async () => {
        if (!phoneConsent) {
            showToast('Please accept the terms and consent first');
            return;
        }
        if (phone.trim().length < 10) {
            showToast('Please enter a valid mobile number');
            return;
        }

        setAuthBusy(true);
        try {
            const response = await fetch('/api/auth/request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: phone.trim() }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showToast(data.error || 'Failed to send OTP');
                return;
            }
            setShowProfileBox(false);
            setShowOtpBox(true);
            showToast(`OTP sent${data.debugOtp ? `. Temporary OTP: ${data.debugOtp}` : ''}`);
        } catch (error) {
            console.error(error);
            showToast('Network error while requesting OTP');
        } finally {
            setAuthBusy(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otp.trim()) {
            showToast('Please enter the OTP');
            return;
        }
        if (showProfileBox && !profileName.trim()) {
            showToast('Please enter your name');
            return;
        }

        setAuthBusy(true);
        try {
            const response = await fetch('/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: phone.trim(),
                    otp: otp.trim(),
                    name: showProfileBox ? profileName.trim() : undefined,
                    email: showProfileBox ? profileEmail.trim() : undefined,
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showToast(data.error || 'Incorrect OTP');
                return;
            }
            if (data.profileRequired) {
                setShowProfileBox(true);
                showToast('OTP verified. Please enter your name to continue.');
                return;
            }
            window.localStorage.setItem('token', data.token);
            setAuthToken(data.token);
            setUserName(data.user?.name || 'Citizen');
            await loadReports(data.token);
            showPage('dashboard');
            showToast(`Welcome, ${data.user?.name || 'Citizen'}`);
        } catch (error) {
            console.error(error);
            showToast('Network error during verification');
        } finally {
            setAuthBusy(false);
        }
    };

    const captureLocation = () => {
        if (!window.isSecureContext) {
            setLocationPermissionState('unavailable');
            showToast('Live location requires HTTPS. Open this application using a secure https:// address.');
            return;
        }
        if (!navigator.geolocation) {
            setLocationPermissionState('unavailable');
            showToast('Location is not supported in this browser. The report cannot be submitted.');
            return;
        }

        setLocationBusy(true);
        setLocationPermissionState('requesting');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLatitude(position.coords.latitude.toFixed(7));
                setLongitude(position.coords.longitude.toFixed(7));
                setLocationAccuracy(position.coords.accuracy);
                setLocationCapturedAt(new Date(position.timestamp).toISOString());
                setLocationPermissionState('granted');
                setLocationBusy(false);
                if (position.coords.accuracy > 100) {
                    showToast('GPS accuracy is too low. Move outdoors and capture the location again.');
                } else {
                    showToast('Current location captured within 100-metre GPS accuracy');
                }
            },
            (error) => {
                setLatitude('');
                setLongitude('');
                setLocationAccuracy(null);
                setLocationCapturedAt('');
                setLocationPermissionState(error.code === 1 ? 'denied' : 'idle');
                setLocationBusy(false);
                if (error.code === 1) {
                    showToast('Location permission was denied. Allow location for this site in Chrome settings.');
                } else if (error.code === 2) {
                    showToast('Your current location is unavailable. Turn on GPS and try again outdoors.');
                } else {
                    showToast('Location capture timed out. Move outdoors and try again.');
                }
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
    };

    const handlePhotoCaptured = (file: File | null) => {
        setPhotoFile(file);
        setLatitude('');
        setLongitude('');
        setLocationAccuracy(null);
        setLocationCapturedAt('');
        setLocationPermissionState('idle');

        if (!file) {
            setPhotoCapturedAt('');
            return;
        }

        setPhotoCapturedAt(new Date().toISOString());
        showToast('Photo captured. Now capture the current location.');
    };

    const submitReport = async () => {
        if (!authToken) {
            showPage('login');
            showToast('Please sign in before submitting a report');
            return;
        }
        if (!photoConsent) {
            showToast('Please accept the photo and location consent before submitting');
            return;
        }
        if (!photoFile) {
            showToast('Please select a pothole photograph');
            return;
        }
        if (!latitude || !longitude) {
            showToast('Current GPS location has not been captured');
            return;
        }
        if (locationAccuracy === null || locationAccuracy > 100) {
            showToast('GPS accuracy must be within 100 metres. Take the photo again outdoors.');
            return;
        }

        const formData = new FormData();
        formData.append('photo', photoFile);
        formData.append('latitude', latitude);
        formData.append('longitude', longitude);
        formData.append('severity', severity);
        formData.append('description', description.trim());
        formData.append('photoCapturedAt', photoCapturedAt);
        formData.append('locationCapturedAt', locationCapturedAt);
        formData.append('locationAccuracy', String(locationAccuracy));

        setReportBusy(true);
        try {
            const response = await fetch('/api/reports', {
                method: 'POST',
                headers: { Authorization: `Bearer ${authToken}` },
                body: formData,
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showToast(data.error || 'Could not submit the report');
                return;
            }

            setLatestReportId(data.reportId);
            setPhotoFile(null);
            setLatitude('');
            setLongitude('');
            setLocationAccuracy(null);
            setPhotoCapturedAt('');
            setLocationCapturedAt('');
            setLocationPermissionState('idle');
            setDescription('');
            setSeverity('Medium');
            setPhotoConsent(false);
            if (photoInputRef.current) {
                photoInputRef.current.value = '';
            }
            await loadReports();
            showPage('success');
            showToast(`Report created: ${data.reportId}`);
        } catch (error) {
            console.error(error);
            showToast('Network error while submitting the report');
        } finally {
            setReportBusy(false);
        }
    };

    const statusLabel = (status: string) => status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    const underVerificationCount = reports.filter((report) => ['reported', 'verified', 'assigned'].includes(report.status)).length;
    const inProgressCount = reports.filter((report) => ['in_progress', 'repaired', 'reopened', 'escalated'].includes(report.status)).length;
    const closedCount = reports.filter((report) => report.status === 'closed').length;

    const pageClass = (page: PageId) => `page${currentPage === page ? ' active' : ''}`;

    return (
        <div className="app">
            <header className="topbar">
                <button className="brand brand-button" type="button" onClick={() => showPage('home')}>
                    <span className="brand-mark">◒</span>
                    <span><strong>The Mirror Project</strong><small>Safer roads for India</small></span>
                </button>
                <nav className="nav" aria-label="Primary navigation">
                    <button type="button" onClick={() => showPage('home')}>Home</button>
                    <button type="button" onClick={openDashboard}>My Reports</button>
                    <button type="button" onClick={() => showPage('impact')}>Public Impact</button>
                    <button className="lang" type="button" onClick={() => showToast('Kannada interface is ready for localisation content')}>ಕನ್ನಡ / EN</button>
                </nav>
            </header>

            <main className="shell">
                <section className={pageClass('home')}>
                    <div className="hero">
                        <div className="hero-copy">
                            <div className="eyebrow">India pothole accountability</div>
                            <h1>See it.<br />Report it.<br /><span style={{ color: 'var(--green)' }}>Fix it.</span></h1>
                            <p>Help make Karnataka&apos;s roads safer. Report dangerous potholes with a photograph and location, then track the action all the way to citizen verification.</p>
                            <div className="actions">
                                <button className="primary" type="button" onClick={() => showPage('login')}>Report a pothole</button>
                                <button className="secondary" type="button" onClick={openDashboard}>Track my report</button>
                            </div>
                        </div>
                        <div className="hero-card">
                            <h3>Visible action, not just complaints.</h3>
                            <p>Verified public statistics will appear here when real reports and authority updates are available.</p>
                        </div>
                    </div>
                    <div className="section">
                        <h2>How it works</h2>
                        <p className="sub">A simple 1–2 minute flow for citizens.</p>
                        <div className="steps">
                            {[
                                ['1', 'See', 'Find a dangerous pothole.'],
                                ['2', 'Capture', 'Take a clear photograph.'],
                                ['3', 'Locate', 'Share the GPS location.'],
                                ['4', 'Report', 'Add severity and context.'],
                                ['5', 'Action', 'Authority processes it.'],
                                ['6', 'Verify', 'You confirm the result.'],
                            ].map(([number, title, text]) => (
                                <div className="step" key={number}><b>{number}</b><h4>{title}</h4><p>{text}</p></div>
                            ))}
                        </div>
                    </div>
                    <div className="section">
                        <h2>Current Karnataka impact</h2>
                        <div className="card unverified-impact">Verified public statistics will appear when real reports are available.</div>
                    </div>
                </section>

                <section className={pageClass('login')}>
                    <div className="panel">
                        <div className="eyebrow">Citizen access</div>
                        <h2>Sign in with OTP</h2>
                        <p className="sub">No password needed. Your mobile number is your identity.</p>
                        <div className="field">
                            <label htmlFor="phone">Mobile number</label>
                            <input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" />
                        </div>
                        <label className="consent">
                            <input type="checkbox" checked={phoneConsent} onChange={(event) => setPhoneConsent(event.target.checked)} />
                            <span>I agree to The Mirror Project <button className="text-link" type="button" onClick={() => setLegalType('terms')}>Terms of Use</button> and <button className="text-link" type="button" onClick={() => setLegalType('privacy')}>Privacy Policy</button>. I consent to the collection and use of my phone number for OTP authentication, account access, service notifications and report updates.</span>
                        </label>
                        <button className="primary full-width auth-action" type="button" disabled={!phoneConsent || authBusy} onClick={handleSendOtp}>
                            {authBusy ? 'Please wait…' : 'Accept and send OTP'}
                        </button>
                        {showOtpBox && (
                            <div>
                                <div className="field"><label htmlFor="otp">Enter 6-digit OTP</label><input id="otp" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="123456" inputMode="numeric" /></div>
                                {!showProfileBox && (
                                    <button className="primary full-width auth-action" type="button" disabled={authBusy} onClick={handleVerifyOtp}>{authBusy ? 'Verifying…' : 'Verify OTP'}</button>
                                )}
                                {showProfileBox && (
                                    <div className="profile-step">
                                        <h3>Complete your profile</h3>
                                        <p className="sub">Your name will be used in your dashboard greeting and reports.</p>
                                        <div className="field"><label htmlFor="profileName">Name <span aria-hidden="true">*</span></label><input id="profileName" value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Enter your full name" maxLength={150} required /></div>
                                        <div className="field"><label htmlFor="profileEmail">Email <span className="optional-label">(optional)</span></label><input id="profileEmail" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} placeholder="you@example.com" type="email" maxLength={254} /></div>
                                        <button className="primary full-width auth-action" type="button" disabled={authBusy || !profileName.trim()} onClick={handleVerifyOtp}>{authBusy ? 'Saving…' : 'Save and continue'}</button>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="demo-note">Database mode: OTP requests and verified users are stored in the FRSCMP Oracle database. Until SMS is configured, the temporary OTP is <b>123456</b>.</div>
                    </div>
                </section>

                <section className={pageClass('dashboard')}>
                    <div className="dash-head">
                        <div><div className="eyebrow">Citizen dashboard</div><h2>Hi, {userName}</h2><p className="sub">Track every report from submission to closure.</p></div>
                        <button className="primary" type="button" onClick={() => showPage('report')}>＋ Report a pothole</button>
                    </div>
                    <div className="stat-grid">
                        <div className="card"><strong>{reports.length}</strong><span>Reports submitted</span></div>
                        <div className="card"><strong>{underVerificationCount}</strong><span>Under verification</span></div>
                        <div className="card"><strong>{inProgressCount}</strong><span>In progress</span></div>
                        <div className="card"><strong>{closedCount}</strong><span>Closed</span></div>
                    </div>
                    <div className="section dashboard-reports">
                        <h2>My recent reports</h2>
                        <div className="reports">
                            {reportsBusy && <div className="card empty-reports">Loading reports…</div>}
                            {!reportsBusy && reports.length === 0 && <div className="card empty-reports">No reports submitted yet.</div>}
                            {!reportsBusy && reports.map((report) => (
                                <div className="report-row" key={report.reportId}>
                                    {report.photoUrl
                                        ? <ReportPhoto photoUrl={report.photoUrl} token={authToken} reportId={report.reportId} />
                                        : <div className="report-photo report-photo-loading">No photo</div>}
                                    <div><h4>{report.reportId}</h4><p>{Number(report.latitude).toFixed(5)}, {Number(report.longitude).toFixed(5)} · {new Date(report.submittedAt).toLocaleDateString('en-IN')}</p></div>
                                    <div className="report-row-status"><span className={`badge ${report.status === 'closed' ? 'green' : 'orange'}`}>{statusLabel(report.status)}</span><br /><small className="muted-text">{report.potholePublicId} · {statusLabel(report.severity)} severity</small></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className={pageClass('report')}>
                    <div className="panel">
                        <div className="eyebrow">New report</div><h2>Report a pothole</h2><p className="sub">Add evidence, location and a quick description.</p>
                        <div className="field">
                            <label>1 · Photograph</label>
                            <label className="consent"><input type="checkbox" checked={photoConsent} onChange={(event) => setPhotoConsent(event.target.checked)} /><span>I consent to The Mirror Project collecting and using this photograph, GPS location and description to verify, route and track this road-safety report. My personal contact details will not be publicly displayed. <button className="text-link" type="button" onClick={() => setLegalType('privacy')}>Learn more</button></span></label>
                            <input ref={photoInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => handlePhotoCaptured(event.target.files?.[0] || null)} />
                            <div className="upload"><button type="button" disabled={!photoConsent || locationBusy} onClick={() => photoInputRef.current?.click()}>◎ Take photo</button></div>
                            <small className="muted-text">{photoFile ? `${photoFile.name} · ${(photoFile.size / 1024 / 1024).toFixed(2)} MB` : 'Accept the consent, then take a current photo · JPEG, PNG or WebP · maximum 5 MB'}</small>
                        </div>
                        <div className="field">
                            <label>2 · Current location</label>
                            <button className="secondary full-width" type="button" disabled={!photoConsent || !photoFile || locationBusy} onClick={captureLocation}>
                                {locationBusy ? 'Capturing current location…' : locationPermissionState === 'granted' ? 'Capture current location again' : 'Capture current location'}
                            </button>
                            <div className="location-lock card">
                                {locationBusy
                                    ? 'Waiting for a precise GPS location…'
                                    : locationPermissionState === 'unavailable'
                                        ? 'Current location requires a secure HTTPS connection.'
                                        : locationPermissionState === 'denied'
                                            ? 'Location is blocked. Allow it in Chrome site settings, then try again.'
                                            : latitude && longitude
                                                ? <><strong>{(locationAccuracy || 0) <= 100 ? 'Location verified' : 'Location accuracy is too low'}</strong><span>{latitude}, {longitude}</span><small>Accuracy: approximately {Math.round(locationAccuracy || 0)} metres · required: 100 metres or better</small></>
                                                : photoFile
                                                    ? 'Photo ready. Capture the current GPS location within two minutes.'
                                                    : 'Take a photo first, then capture the current location.'}
                            </div>
                        </div>
                        <div className="field">
                            <label>3 · How dangerous is this pothole?</label>
                            <div className="severity">{['Low', 'Medium', 'High', 'Critical'].map((value) => <button className={severity === value ? 'selected' : ''} type="button" key={value} onClick={() => setSeverity(value)}>{value}</button>)}</div>
                        </div>
                        <div className="field"><label htmlFor="description">4 · Describe the problem</label><textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} placeholder="Large pothole near the bus stop. Dangerous for two-wheelers." /></div>
                        <button className="primary full-width report-submit" type="button" disabled={reportBusy || locationBusy || !photoConsent || !photoFile || !latitude || !longitude || locationAccuracy === null || locationAccuracy > 100} onClick={submitReport}>{reportBusy ? 'Submitting report…' : 'Review and submit report'}</button>
                    </div>
                </section>

                <section className={pageClass('success')}>
                    <div className="panel success-panel">
                        <div className="success-icon">✓</div><div className="eyebrow">Report received</div><h2>Report submitted successfully</h2><p className="sub">Your pothole report has been recorded and can now be tracked.</p>
                        <div className="card report-id-card"><div className="muted-text report-id-label">Your report ID</div><strong className="report-id">{latestReportId}</strong></div>
                        <div className="actions centered-actions"><button className="primary" type="button" onClick={openDashboard}>Track report</button><button className="secondary" type="button" onClick={openDashboard}>Back to dashboard</button></div>
                    </div>
                </section>

                <section className={pageClass('impact')}>
                    <div className="eyebrow">Public transparency</div><h2>Karnataka impact dashboard</h2><p className="sub">Aggregated statistics only. No private citizen information is exposed.</p>
                    <div className="card unverified-impact impact-top">Verified public statistics and map information will appear after real reports have been reviewed.</div>
                </section>

                <footer className="footer"><span>© 2026 The Mirror Project · Karnataka pilot prototype</span><span><button className="footer-link" type="button" onClick={() => setLegalType('privacy')}>Privacy</button> · <button className="footer-link" type="button" onClick={() => setLegalType('terms')}>Terms</button> · Accessibility</span></footer>
            </main>

            {toastVisible && <div className="toast visible-toast" role="status">{toastMessage}</div>}
            {legalType && (
                <div className="legal-overlay" role="presentation" onClick={() => setLegalType(null)}>
                    <div className="panel legal-panel" role="dialog" aria-modal="true" aria-labelledby="legal-title" onClick={(event) => event.stopPropagation()}>
                        <button className="legal-close" type="button" aria-label="Close" onClick={() => setLegalType(null)}>×</button>
                        <div className="eyebrow">{legalType === 'terms' ? 'Terms of Use' : 'Privacy Policy'}</div><h2 id="legal-title">{legalType === 'terms' ? 'Terms of Use' : 'Privacy Policy'}</h2>
                        {legalType === 'terms' ? <><p>By using The Mirror Project, you agree to submit truthful road-safety information and use the service lawfully. Reports may be reviewed, routed to the responsible authority and retained as necessary for accountability, safety and dispute resolution.</p><p>Do not upload private, unlawful or unrelated content. Production terms should be reviewed and approved by a qualified legal adviser before launch.</p></> : <><p>The Mirror Project collects your name, mobile number and optional email to create and manage your account. Your phone number is used for OTP authentication and important service notifications.</p><p>When you submit a report, the project collects the photograph, GPS location, severity and description. This information is used to verify the issue, identify the responsible authority, coordinate repairs and maintain an accountability record.</p><p>Personal contact details are not displayed on the public map or public statistics dashboard. Production deployment should include retention periods, deletion requests, access controls and a legally reviewed privacy notice.</p></>}
                        <button className="primary full-width legal-accept" type="button" onClick={() => setLegalType(null)}>I understand</button>
                    </div>
                </div>
            )}
        </div>
    );
}
