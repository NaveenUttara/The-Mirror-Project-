'use client';

import React, { useState } from 'react';

export default function Home() {
    const [currentPage, setCurrentPage] = useState('home');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState('');
    const [showOtpBox, setShowOtpBox] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastVisible, setToastVisible] = useState(false);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setToastVisible(true);
        setTimeout(() => setToastVisible(false), 2600);
    };

    const handleSendOtp = async () => {
        if (!phone) {
            showToast('Please enter a mobile number');
            return;
        }

        try {
            const response = await fetch('/api/auth/request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone }),
            });
            const data = await response.json().catch(() => ({}));

            if (response.ok) {
                setShowOtpBox(true);
                showToast(`OTP sent! (Dev code: ${data.debugOtp || '123456'})`);
            } else {
                showToast(data.error || 'Failed to send OTP');
            }
        } catch (err) {
            console.error(err);
            showToast('Network error while requesting OTP');
        }
    };

    const handleVerifyOtp = async () => {
        if (!otp) {
            showToast('Please enter the OTP');
            return;
        }

        try {
            const response = await fetch('/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, otp }),
            });
            const data = await response.json().catch(() => ({}));

            if (response.ok) {
                localStorage.setItem('token', data.token);
                setCurrentPage('dashboard');
                showToast(`Welcome back, ${data.user.name}`);
            } else {
                showToast(data.error || 'Incorrect OTP');
            }
        } catch (err) {
            console.error(err);
            showToast('Network error during verification');
        }
    };

    return (
        <div className="min-h-screen bg-[#f5f8f6] text-[#12212b] font-sans">
            <header className="h-[72px] bg-white border-b border-[#dfe8e5] flex items-center justify-between px-[5vw] sticky top-0 z-50">
                <div className="flex gap-[11px] items-center font-extrabold tracking-tight">
                    <div className="w-[38px] h-[38px] rounded-[13px] bg-[#087f5b] text-white grid place-items-center text-xl">◒</div>
                    <div>
                        <span>The Mirror Project</span>
                        <small className="block text-[#667781] font-medium text-[11px] tracking-normal">Safer roads for Karnataka</small>
                    </div>
                </div>
                <nav className="flex gap-2 items-center">
                    <button onClick={() => setCurrentPage('home')} className="bg-transparent text-[#667781] px-3 py-2.5 rounded-[10px] hover:bg-[#f5f8f6] hover:text-[#12212b]">Home</button>
                    <button onClick={() => setCurrentPage('dashboard')} className="bg-transparent text-[#667781] px-3 py-2.5 rounded-[10px] hover:bg-[#f5f8f6] hover:text-[#12212b]">My Reports</button>
                    <button onClick={() => setCurrentPage('impact')} className="bg-transparent text-[#667781] px-3 py-2.5 rounded-[10px] hover:bg-[#f5f8f6] hover:text-[#12212b]">Public Impact</button>
                    <button onClick={() => showToast('Kannada interface ready for localisation')} className="bg-transparent text-[#667781] px-3 py-2.5 rounded-[10px] hover:bg-[#f5f8f6] hover:text-[#12212b]">ಕನ್ನಡ / EN</button>
                </nav>
            </header>

            <main className="max-w-[1180px] mx-auto px-[5vw] py-[42px] pb-[70px]">
                {currentPage === 'home' && (
                    <section>
                        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_.85fr] gap-7 items-stretch">
                            <div className="py-9">
                                <div className="text-[#087f5b] font-extrabold uppercase text-xs tracking-[.14em]">Karnataka pothole accountability</div>
                                <h1 className="text-5xl lg:text-[78px] leading-[0.96] tracking-[-0.065em] my-[18px]">See it.<br />Report it.<br /><span className="text-[#087f5b]">Fix it.</span></h1>
                                <p className="text-[19px] text-[#667781] max-w-[570px] leading-[1.55]">Help make Karnataka&apos;s roads safer. Report dangerous potholes with a photograph and location, then track the action all the way to citizen verification.</p>
                                <div className="flex gap-3 flex-wrap mt-[26px]">
                                    <button onClick={() => setCurrentPage('login')} className="bg-[#087f5b] text-white px-5 py-[15px] rounded-[13px] font-bold shadow-[0_8px_18px_rgba(8,127,91,.2)] hover:bg-[#066c4d]">Report a pothole</button>
                                    <button onClick={() => setCurrentPage('dashboard')} className="bg-white text-[#12212b] px-5 py-[15px] border border-[#dfe8e5] rounded-[13px] font-bold">Track my report</button>
                                </div>
                            </div>
                            <div className="bg-gradient-to-br from-[#0c7555] to-[#0d9b70] rounded-[30px] p-7 text-white shadow-[0_14px_35px_rgba(18,33,43,.08)] relative overflow-hidden flex flex-col justify-center">
                                <h3 className="text-2xl mb-6 relative z-10">Visible action, not just complaints.</h3>
                                <div className="flex justify-between border-t border-white/20 py-4 relative z-10"><span>Potholes reported</span><strong className="text-2xl">1,250</strong></div>
                                <div className="flex justify-between border-t border-white/20 py-4 relative z-10"><span>Repairs citizen-confirmed</span><strong className="text-2xl">650</strong></div>
                                <div className="flex justify-between border-t border-white/20 py-4 relative z-10"><span>Open accountability cases</span><strong className="text-2xl">35</strong></div>
                            </div>
                        </div>
                    </section>
                )}

                {currentPage === 'login' && (
                    <section className="max-w-[650px] mx-auto bg-white border border-[#dfe8e5] rounded-[26px] p-7 shadow-[0_14px_35px_rgba(18,33,43,.08)]">
                        <div className="text-[#087f5b] font-extrabold uppercase text-xs tracking-[.14em]">Citizen access</div>
                        <h2 className="text-[30px] font-bold tracking-[-0.04em] mt-2 mb-1">Sign in with OTP</h2>
                        <p className="text-[#667781] mb-6">No password needed. Your mobile number is your identity.</p>
                        <div className="mt-[18px]">
                            <label className="block text-[13px] font-bold mb-[7px]">Mobile number</label>
                            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className="w-full p-[13px_14px] rounded-[12px] border border-[#ccd9d5] bg-[#fbfdfc] outline-none focus:border-[#087f5b]" />
                        </div>
                        {!showOtpBox ? (
                            <button onClick={handleSendOtp} className="mt-5 w-full bg-[#087f5b] text-white p-4 rounded-[13px] font-bold">Send OTP</button>
                        ) : (
                            <div className="mt-4">
                                <div className="mt-[18px]">
                                    <label className="block text-[13px] font-bold mb-[7px]">Enter 6-digit OTP</label>
                                    <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" inputMode="numeric" className="w-full p-[13px_14px] rounded-[12px] border border-[#ccd9d5] bg-[#fbfdfc] outline-none focus:border-[#087f5b]" />
                                </div>
                                <button onClick={handleVerifyOtp} className="mt-5 w-full bg-[#087f5b] text-white p-4 rounded-[13px] font-bold">Verify and continue</button>
                            </div>
                        )}
                        <div className="bg-[#fff7df] text-[#72520a] border border-[#f2d58a] p-[11px_13px] rounded-[12px] text-[13px] mt-4">
                            Database Mode: Real OTP request connected to your FRSCMP database.
                        </div>
                    </section>
                )}

                {currentPage === 'dashboard' && (
                    <section>
                        <div className="flex justify-between items-center flex-wrap gap-4">
                            <div>
                                <div className="text-[#087f5b] font-extrabold uppercase text-xs">Citizen dashboard</div>
                                <h2 className="text-[30px] font-bold">Welcome, Citizen</h2>
                                <p className="text-[#667781]">Track every report from submission to closure.</p>
                            </div>
                            <button onClick={() => setCurrentPage('login')} className="bg-[#087f5b] text-white px-5 py-3 rounded-[13px] font-bold">＋ Report a pothole</button>
                        </div>
                    </section>
                )}

                {toastVisible && (
                    <div className="fixed right-5 bottom-5 bg-[#12212b] text-white p-[14px_18px] rounded-[14px] shadow-lg z-50">
                        {toastMessage}
                    </div>
                )}
            </main>
        </div>
    );
}
