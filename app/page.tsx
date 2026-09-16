'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import {
    formatMessage,
    getStoredLanguage,
    LANGUAGE_STORAGE_KEY,
    t,
    translateSeverity,
    translateStatus,
    type Language,
} from './i18n';
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
type PublicImpact = {
    totalReports: number;
    underReview: number;
    inProgress: number;
    repaired: number;
    issues: PublicIssue[];
};
type PublicIssue = {
    id: string;
    latitude: number;
    longitude: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: string;
};

const severityColor = (severity: PublicIssue['severity']) => ({
    low: '#2f8f5b',
    medium: '#eab308',
    high: '#f97316',
    critical: '#dc2626',
}[severity]);

function ReportPhoto({ photoUrl, token, reportId, loadingLabel }: { photoUrl: string; token: string; reportId: string; loadingLabel: string }) {
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
        : <div className="report-photo report-photo-loading" aria-label={loadingLabel}>{loadingLabel}</div>;
}

export default function Home() {
    const [currentPage, setCurrentPage] = useState<PageId>('home');
    const [phone, setPhone] = useState('');
    const [phoneConsent, setPhoneConsent] = useState(false);
    const [profileName, setProfileName] = useState('');
    const [profileEmail, setProfileEmail] = useState('');
    const [authBusy, setAuthBusy] = useState(false);
    const [authToken, setAuthToken] = useState(() =>
        typeof window === 'undefined' ? '' : window.localStorage.getItem('token') || ''
    );
    const [userName, setUserName] = useState('Citizen');
    const [reports, setReports] = useState<CitizenReport[]>([]);
    const [reportsBusy, setReportsBusy] = useState(false);
    const [publicImpact, setPublicImpact] = useState<PublicImpact | null>(null);
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
    const [language, setLanguage] = useState<Language>(() => getStoredLanguage());
    const photoInputRef = useRef<HTMLInputElement>(null);
    const copy = t(language);

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
                showToast(data.error || copy.toasts.loadReportsFailed);
                return;
            }
            setReports(data.reports || []);
            setUserName(data.user?.name || 'Citizen');
        } catch (error) {
            console.error(error);
            showToast(copy.toasts.networkReports);
        } finally {
            setReportsBusy(false);
        }
    };

    const openDashboard = () => {
        if (!authToken) {
            showPage('login');
            showToast(copy.toasts.signInRequired);
            return;
        }
        showPage('dashboard');
        void loadReports();
    };

    const openPublicImpact = () => {
        showPage('impact');
        void loadPublicImpact();
    };

    const loadPublicImpact = async () => {
        try {
            const response = await fetch('/api/public-impact', { cache: 'no-store' });
            if (!response.ok) return;
            setPublicImpact(await response.json());
        } catch (error) {
            console.error(error);
        }
    };

    useEffect(() => {
        if (authToken) {
            void loadReports(authToken);
        }
    }, [authToken]);

    useEffect(() => {
        void loadPublicImpact();
    }, []);

    useEffect(() => {
        document.documentElement.lang = language === 'kn' ? 'kn' : 'en';
    }, [language]);

    const toggleLanguage = () => {
        const next: Language = language === 'en' ? 'kn' : 'en';
        setLanguage(next);
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
        showToast(t(next).toasts[next === 'kn' ? 'languageSwitchedKn' : 'languageSwitchedEn']);
    };

    const handleLogin = async () => {
        if (!phoneConsent) {
            showToast(copy.toasts.acceptTerms);
            return;
        }
        if (phone.trim().length < 10) {
            showToast(copy.toasts.invalidPhone);
            return;
        }
        if (!profileName.trim()) {
            showToast(copy.toasts.enterName);
            return;
        }

        setAuthBusy(true);
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: phone.trim(),
                    name: profileName.trim(),
                    email: profileEmail.trim(),
                }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                showToast(data.error || copy.toasts.loginFailed);
                return;
            }

            window.localStorage.setItem('token', data.token);
            window.localStorage.setItem(
                `mirror_profile_${phone.trim()}`,
                JSON.stringify({ name: data.user?.name || profileName.trim(), email: data.user?.email || profileEmail.trim() || '' }),
            );
            setAuthToken(data.token);
            setUserName(data.user?.name || profileName.trim());
            await loadReports(data.token);
            showPage('dashboard');
            showToast(`${copy.toasts.welcome} ${data.user?.name || profileName.trim()}`);
        } catch (error) {
            console.error(error);
            showToast(copy.toasts.networkLogin);
        } finally {
            setAuthBusy(false);
        }
    };

    const captureLocation = () => {
        if (!window.isSecureContext) {
            setLocationPermissionState('unavailable');
            showToast(copy.toasts.httpsLocation);
            return;
        }
        if (!navigator.geolocation) {
            setLocationPermissionState('unavailable');
            showToast(copy.toasts.locationUnsupported);
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
                    showToast(copy.toasts.gpsLow);
                } else {
                    showToast(copy.toasts.locationCaptured);
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
                    showToast(copy.toasts.locationDenied);
                } else if (error.code === 2) {
                    showToast(copy.toasts.locationUnavailable);
                } else {
                    showToast(copy.toasts.locationTimeout);
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
        showToast(copy.toasts.photoCaptured);
    };

    const submitReport = async () => {
        if (!authToken) {
            showPage('login');
            showToast(copy.toasts.signInSubmit);
            return;
        }
        if (!photoConsent) {
            showToast(copy.toasts.photoConsentRequired);
            return;
        }
        if (!photoFile) {
            showToast(copy.toasts.photoRequired);
            return;
        }
        if (!latitude || !longitude) {
            showToast(copy.toasts.gpsNotCaptured);
            return;
        }
        if (locationAccuracy === null || locationAccuracy > 100) {
            showToast(copy.toasts.gpsAccuracyRequired);
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
                showToast(data.error || copy.toasts.submitFailed);
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
            showToast(`${copy.toasts.reportCreated} ${data.reportId}`);
        } catch (error) {
            console.error(error);
            showToast(copy.toasts.networkSubmit);
        } finally {
            setReportBusy(false);
        }
    };

    const severityOptions = ['low', 'medium', 'high', 'critical'] as const;
    const underVerificationCount = reports.filter((report) => ['reported', 'verified', 'assigned'].includes(report.status)).length;
    const inProgressCount = reports.filter((report) => ['in_progress', 'repaired', 'reopened', 'escalated'].includes(report.status)).length;
    const closedCount = reports.filter((report) => report.status === 'closed').length;
    const latestReport = reports[0];
    const publicIssues = publicImpact?.issues || [];
    const issueLatitudes = publicIssues.map((issue) => issue.latitude);
    const issueLongitudes = publicIssues.map((issue) => issue.longitude);
    const minLatitude = issueLatitudes.length ? Math.min(...issueLatitudes) : 0;
    const maxLatitude = issueLatitudes.length ? Math.max(...issueLatitudes) : 0;
    const minLongitude = issueLongitudes.length ? Math.min(...issueLongitudes) : 0;
    const maxLongitude = issueLongitudes.length ? Math.max(...issueLongitudes) : 0;
    const latitudeRange = maxLatitude - minLatitude;
    const longitudeRange = maxLongitude - minLongitude;

    const hashOffset = (value: string) => {
        let hash = 0;
        for (let index = 0; index < value.length; index += 1) {
            hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
        }
        return ((hash % 7) - 3) * 1.4;
    };

    const pinPosition = (issue: PublicIssue) => {
        const duplicateCount = publicIssues.filter(
            (candidate) => candidate.latitude === issue.latitude && candidate.longitude === issue.longitude,
        ).length;
        const jitterX = duplicateCount > 1 ? hashOffset(issue.id) : 0;
        const jitterY = duplicateCount > 1 ? hashOffset(`${issue.id}:y`) : 0;

        return {
            left: `${latitudeRange ? 12 + ((issue.latitude - minLatitude) / latitudeRange) * 76 + jitterX : 50 + jitterX}%`,
            top: `${longitudeRange ? 88 - ((issue.longitude - minLongitude) / longitudeRange) * 76 + jitterY : 50 + jitterY}%`,
        };
    };

    const pageClass = (page: PageId) => `page${currentPage === page ? ' active' : ''}`;

    return (
        <div className="app">
            <header className="topbar">
                <button className="brand brand-button" type="button" onClick={() => showPage('home')}>
                    <span className="brand-mark">◒</span>
                    <span><strong>{copy.brandTitle}</strong><small>{copy.brandSubtitle}</small></span>
                </button>
                <nav className="nav" aria-label="Primary navigation">
                    <button type="button" onClick={() => showPage('home')}>{copy.navHome}</button>
                    <button type="button" onClick={openDashboard}>{copy.navReports}</button>
                    <button type="button" onClick={openPublicImpact}>{copy.navImpact}</button>
                    <button className="lang" type="button" onClick={toggleLanguage}>{copy.langToggle}</button>
                </nav>
            </header>

            <main className="shell">
                <section className={pageClass('home')}>
                    <div className="hero">
                        <div className="hero-copy">
                            <div className="eyebrow">{copy.heroEyebrow}</div>
                            <h1>{copy.heroTitleLine1}<br />{copy.heroTitleLine2}<br /><span style={{ color: 'var(--green)' }}>{copy.heroTitleLine3}</span></h1>
                            <p>{copy.heroBody}</p>
                            <div className="actions">
                                <button className="primary" type="button" onClick={() => showPage('login')}>{copy.reportPothole}</button>
                                <button className="secondary" type="button" onClick={openDashboard}>{copy.trackReport}</button>
                            </div>
                        </div>
                        <div className="hero-card">
                            <h3>{copy.liveMapTitle}</h3>
                            <div className="map hero-map" aria-label={copy.liveMapTitle}>
                                {publicIssues.map((issue) => <div key={issue.id} className="pin public-pin" style={{ ...pinPosition(issue), background: severityColor(issue.severity) }} title={`${translateSeverity(language, issue.severity)} · ${translateStatus(language, issue.status)}`} aria-label={`${translateSeverity(language, issue.severity)}, ${translateStatus(language, issue.status)}`} />)}
                                {publicIssues.length === 0 && <p className="map-empty hero-map-empty">{publicImpact ? copy.mapEmpty : copy.mapLoading}</p>}
                            </div>
                            <div className="map-legend hero-map-legend" aria-label="Severity colour legend"><span><i className="legend-dot low" />{copy.severity.low}</span><span><i className="legend-dot medium" />{copy.severity.medium}</span><span><i className="legend-dot high" />{copy.severity.high}</span><span><i className="legend-dot critical" />{copy.severity.critical}</span></div>
                            {latestReport && <p className="hero-map-note">{copy.latestReport} <strong>{translateStatus(language, latestReport.status)}</strong></p>}
                        </div>
                    </div>
                    <div className="section">
                        <h2>{copy.howItWorks}</h2>
                        <p className="sub">{copy.howItWorksSub}</p>
                        <div className="steps">
                            {copy.steps.map((step, index) => (
                                <div className="step" key={step.title}><b>{index + 1}</b><h4>{step.title}</h4><p>{step.text}</p></div>
                            ))}
                        </div>
                    </div>
                    <div className="section">
                        <h2>{copy.impactSectionTitle}</h2>
                        <div className="impact">
                            <div className="card"><strong>{publicImpact?.totalReports ?? '—'}</strong><span>{copy.reportsReceived}</span></div>
                            <div className="card"><strong>{publicImpact?.underReview ?? '—'}</strong><span>{copy.underReview}</span></div>
                            <div className="card"><strong>{publicImpact?.inProgress ?? '—'}</strong><span>{copy.workInProgress}</span></div>
                            <div className="card"><strong>{publicImpact?.repaired ?? '—'}</strong><span>{copy.repaired}</span></div>
                        </div>
                    </div>
                </section>

                <section className={pageClass('login')}>
                    <div className="panel">
                        <div className="eyebrow">{copy.citizenAccess}</div>
                        <h2>{copy.signInTitle}</h2>
                        <p className="sub">{copy.signInSub}</p>
                        <div className="field">
                            <label htmlFor="phone">{copy.mobileNumber}</label>
                            <input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={copy.phonePlaceholder} inputMode="tel" />
                        </div>
                        <div className="field">
                            <label htmlFor="profileName">{copy.name} <span aria-hidden="true">*</span></label>
                            <input id="profileName" value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder={copy.namePlaceholder} maxLength={150} required />
                        </div>
                        <div className="field">
                            <label htmlFor="profileEmail">{copy.email} <span className="optional-label">{copy.optional}</span></label>
                            <input id="profileEmail" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} placeholder={copy.emailPlaceholder} type="email" maxLength={254} />
                        </div>
                        <label className="consent">
                            <input type="checkbox" checked={phoneConsent} onChange={(event) => setPhoneConsent(event.target.checked)} />
                            <span>{copy.phoneConsentBefore} <button className="text-link" type="button" onClick={() => setLegalType('terms')}>{copy.termsOfUse}</button> {copy.phoneConsentBetween} <button className="text-link" type="button" onClick={() => setLegalType('privacy')}>{copy.privacyPolicy}</button>. {copy.phoneConsentAfter}</span>
                        </label>
                        <button className="primary full-width auth-action" type="button" disabled={!phoneConsent || authBusy || !phone.trim() || !profileName.trim()} onClick={handleLogin}>
                            {authBusy ? copy.pleaseWait : copy.acceptSendOtp}
                        </button>
                    </div>
                </section>

                <section className={pageClass('dashboard')}>
                    <div className="dash-head">
                        <div><div className="eyebrow">{copy.dashboardEyebrow}</div><h2>{copy.dashboardGreeting} {userName}</h2><p className="sub">{copy.dashboardSub}</p></div>
                        <button className="primary" type="button" onClick={() => showPage('report')}>{copy.newReportButton}</button>
                    </div>
                    <div className="stat-grid">
                        <div className="card"><strong>{reports.length}</strong><span>{copy.reportsSubmitted}</span></div>
                        <div className="card"><strong>{underVerificationCount}</strong><span>{copy.underVerification}</span></div>
                        <div className="card"><strong>{inProgressCount}</strong><span>{copy.inProgress}</span></div>
                        <div className="card"><strong>{closedCount}</strong><span>{copy.closed}</span></div>
                    </div>
                    <div className="section dashboard-reports">
                        <h2>{copy.recentReports}</h2>
                        <div className="reports">
                            {reportsBusy && <div className="card empty-reports">{copy.loadingReports}</div>}
                            {!reportsBusy && reports.length === 0 && <div className="card empty-reports">{copy.noReports}</div>}
                            {!reportsBusy && reports.map((report) => (
                                <div className="report-row" key={report.reportId}>
                                    {report.photoUrl
                                        ? <ReportPhoto photoUrl={report.photoUrl} token={authToken} reportId={report.reportId} loadingLabel={copy.loadingPhoto} />
                                        : <div className="report-photo report-photo-loading">{copy.noPhoto}</div>}
                                    <div><h4>{report.reportId}</h4><p>{Number(report.latitude).toFixed(5)}, {Number(report.longitude).toFixed(5)} · {new Date(report.submittedAt).toLocaleDateString(language === 'kn' ? 'kn-IN' : 'en-IN')}</p></div>
                                    <div className="report-row-status"><span className={`badge ${report.status === 'closed' ? 'green' : 'orange'}`}>{translateStatus(language, report.status)}</span><br /><small className="muted-text">{report.potholePublicId} · {translateSeverity(language, report.severity)}</small></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className={pageClass('report')}>
                    <div className="panel">
                        <div className="eyebrow">{copy.newReportEyebrow}</div><h2>{copy.newReportTitle}</h2><p className="sub">{copy.newReportSub}</p>
                        <div className="field">
                            <label>{copy.stepPhoto}</label>
                            <label className="consent"><input type="checkbox" checked={photoConsent} onChange={(event) => setPhotoConsent(event.target.checked)} /><span>{copy.photoConsentBefore} {copy.photoConsentAfter} <button className="text-link" type="button" onClick={() => setLegalType('privacy')}>{copy.learnMore}</button></span></label>
                            <input ref={photoInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => handlePhotoCaptured(event.target.files?.[0] || null)} />
                            <div className="upload"><button type="button" disabled={!photoConsent || locationBusy} onClick={() => photoInputRef.current?.click()}>{copy.takePhoto}</button></div>
                            <small className="muted-text">{photoFile ? `${photoFile.name} · ${(photoFile.size / 1024 / 1024).toFixed(2)} MB` : copy.photoHint}</small>
                        </div>
                        <div className="field">
                            <label>{copy.stepLocation}</label>
                            <button className="secondary full-width" type="button" disabled={!photoConsent || !photoFile || locationBusy} onClick={captureLocation}>
                                {locationBusy ? copy.capturingLocation : locationPermissionState === 'granted' ? copy.captureLocationAgain : copy.captureLocation}
                            </button>
                            <div className="location-lock card">
                                {locationBusy
                                    ? copy.waitingGps
                                    : locationPermissionState === 'unavailable'
                                        ? copy.httpsRequired
                                        : locationPermissionState === 'denied'
                                            ? copy.locationBlocked
                                            : latitude && longitude
                                                ? <><strong>{(locationAccuracy || 0) <= 100 ? copy.locationVerified : copy.locationTooLow}</strong><span>{latitude}, {longitude}</span><small>{formatMessage(copy.accuracyRequired, { accuracy: Math.round(locationAccuracy || 0) })}</small></>
                                                : photoFile
                                                    ? copy.photoReadyCapture
                                                    : copy.takePhotoFirst}
                            </div>
                        </div>
                        <div className="field">
                            <label>{copy.stepSeverity}</label>
                            <div className="severity">{severityOptions.map((value) => {
                                const apiValue = `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
                                return <button className={severity === apiValue ? 'selected' : ''} type="button" key={value} onClick={() => setSeverity(apiValue)}>{copy.severity[value]}</button>;
                            })}</div>
                        </div>
                        <div className="field"><label htmlFor="description">{copy.stepDescription}</label><textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} placeholder={copy.descriptionPlaceholder} /></div>
                        <button className="primary full-width report-submit" type="button" disabled={reportBusy || locationBusy || !photoConsent || !photoFile || !latitude || !longitude || locationAccuracy === null || locationAccuracy > 100} onClick={submitReport}>{reportBusy ? copy.submittingReport : copy.reviewSubmit}</button>
                    </div>
                </section>

                <section className={pageClass('success')}>
                    <div className="panel success-panel">
                        <div className="success-icon">✓</div><div className="eyebrow">{copy.successEyebrow}</div><h2>{copy.successTitle}</h2><p className="sub">{copy.successSub}</p>
                        <div className="card report-id-card"><div className="muted-text report-id-label">{copy.yourReportId}</div><strong className="report-id">{latestReportId}</strong></div>
                        <div className="actions centered-actions"><button className="primary" type="button" onClick={openDashboard}>{copy.trackReportBtn}</button><button className="secondary" type="button" onClick={openDashboard}>{copy.backDashboard}</button></div>
                    </div>
                </section>

                <section className={pageClass('impact')}>
                    <div className="eyebrow">{copy.impactEyebrow}</div><h2>{copy.impactTitle}</h2><p className="sub">{copy.impactSub}</p>
                    <div className="impact impact-top">
                        <div className="card"><strong>{publicImpact?.totalReports ?? '—'}</strong><span>{copy.reportsReceived}</span></div>
                        <div className="card"><strong>{publicImpact?.underReview ?? '—'}</strong><span>{copy.underReview}</span></div>
                        <div className="card"><strong>{publicImpact?.inProgress ?? '—'}</strong><span>{copy.workInProgress}</span></div>
                        <div className="card"><strong>{publicImpact?.repaired ?? '—'}</strong><span>{copy.repaired}</span></div>
                    </div>
                    <div className="card public-map-card">
                        <div className="map-heading"><div><h3>{copy.mapHeadingTitle}</h3><p>{copy.mapHeadingSub}</p></div><span>{formatMessage(copy.visibleCount, { count: publicIssues.length })}</span></div>
                        <div className="map public-map" aria-label={copy.mapHeadingTitle}>
                            {publicIssues.map((issue) => <div key={issue.id} className="pin public-pin" style={{ ...pinPosition(issue), background: severityColor(issue.severity) }} title={`${translateSeverity(language, issue.severity)} · ${translateStatus(language, issue.status)}`} aria-label={`${translateSeverity(language, issue.severity)}, ${translateStatus(language, issue.status)}`} />)}
                            {publicIssues.length === 0 && <p className="map-empty">{copy.publicMapEmpty}</p>}
                        </div>
                        <div className="map-legend" aria-label="Severity colour legend"><span><i className="legend-dot low" />{copy.severity.low}</span><span><i className="legend-dot medium" />{copy.severity.medium}</span><span><i className="legend-dot high" />{copy.severity.high}</span><span><i className="legend-dot critical" />{copy.severity.critical}</span></div>
                    </div>
                    <div className="section public-issue-list">
                        <h3>{copy.issueListTitle}</h3>
                        <p className="sub">{copy.issueListSub}</p>
                        <div className="issue-list">
                            {publicIssues.length === 0 && <div className="card issue-row empty-issue-list">{copy.publicMapEmpty}</div>}
                            {publicIssues.map((issue) => (
                                <div className="card issue-row" key={issue.id}>
                                    <div className="issue-row-main">
                                        <strong>{issue.id}</strong>
                                        <span className={`badge ${issue.status === 'closed' ? 'green' : 'orange'}`}>{translateStatus(language, issue.status)}</span>
                                    </div>
                                    <p>{translateSeverity(language, issue.severity)} · {copy.issueLocation}: {issue.latitude.toFixed(4)}, {issue.longitude.toFixed(4)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <footer className="footer"><span>{copy.footer}</span><span><button className="footer-link" type="button" onClick={() => setLegalType('privacy')}>{copy.privacy}</button> · <button className="footer-link" type="button" onClick={() => setLegalType('terms')}>{copy.terms}</button> · {copy.accessibility}</span></footer>
            </main>

            {toastVisible && <div className="toast visible-toast" role="status">{toastMessage}</div>}
            {legalType && (
                <div className="legal-overlay" role="presentation" onClick={() => setLegalType(null)}>
                    <div className="panel legal-panel" role="dialog" aria-modal="true" aria-labelledby="legal-title" onClick={(event) => event.stopPropagation()}>
                        <button className="legal-close" type="button" aria-label={copy.close} onClick={() => setLegalType(null)}>×</button>
                        <div className="eyebrow">{legalType === 'terms' ? copy.legalTermsEyebrow : copy.legalPrivacyEyebrow}</div><h2 id="legal-title">{legalType === 'terms' ? copy.legalTermsEyebrow : copy.legalPrivacyEyebrow}</h2>
                        {legalType === 'terms' ? <><p>{copy.legalTermsBody1}</p><p>{copy.legalTermsBody2}</p></> : <><p>{copy.legalPrivacyBody1}</p><p>{copy.legalPrivacyBody2}</p><p>{copy.legalPrivacyBody3}</p></>}
                        <button className="primary full-width legal-accept" type="button" onClick={() => setLegalType(null)}>{copy.understand}</button>
                    </div>
                </div>
            )}
        </div>
    );
}
