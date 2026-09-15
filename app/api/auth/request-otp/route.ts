import { NextResponse } from 'next/server';
import { createOtpSession } from '@/lib/otp-session';
import { fetchMedusaAuth } from '@/lib/auth-backend';
import { forwardedResponse } from '@/lib/medusa-proxy';

export async function POST(request: Request) {
    try {
        const { phone } = await request.json();

        const medusaResponse = await fetchMedusaAuth('/mirror/auth/request-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone }),
        });
        if (medusaResponse) {
            return forwardedResponse(medusaResponse);
        }

        if (!phone || phone.length < 10) {
            return NextResponse.json({ error: 'Valid mobile number is required' }, { status: 400 });
        }

        // Use a visible fixed OTP until the SMS gateway is configured.
        // Adding SMS_API_KEY automatically switches this route to random OTPs.
        const smsApiKey = process.env.SMS_API_KEY?.trim();
        const isTemporaryOtp = !smsApiKey;
        const otp = isTemporaryOtp
            ? '123456'
            : Math.floor(100000 + Math.random() * 900000).toString();

        const otpSession = createOtpSession(phone, otp);

        // Optional: Trigger external SMS gateway if API key is present
        if (smsApiKey) {
            await fetch('https://www.fast2sms.com/dev/bulkV2', {
                method: 'POST',
                headers: {
                    'authorization': smsApiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    route: 'otp',
                    variables_values: otp,
                    numbers: phone,
                })
            });
        }

        return NextResponse.json({
            success: true,
            message: isTemporaryOtp ? 'Temporary OTP generated' : 'OTP sent successfully',
            debugOtp: isTemporaryOtp ? otp : undefined,
            otpSession,
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
