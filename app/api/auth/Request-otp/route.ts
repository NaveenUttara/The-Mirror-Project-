import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import crypto from 'crypto';

export async function POST(request: Request) {
    try {
        const { phone } = await request.json();

        if (!phone || phone.length < 10) {
            return NextResponse.json({ error: 'Valid mobile number is required' }, { status: 400 });
        }

        // Generate a random 6-digit OTP
        const otp = process.env.NODE_ENV === 'development' ? '123456' : Math.floor(100000 + Math.random() * 900000).toString();

        // Hash the OTP before saving to database for security
        const salt = crypto.randomBytes(16).toString('hex');
        const otpHash = crypto.scryptSync(otp, salt, 64).toString('hex') + ':' + salt;

        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // Expires in 10 minutes

        // Save hashed OTP to your FRSCMP database
        await pool.query(
            `INSERT INTO otp_requests (phone, otp_hash, expires_at) VALUES ($1, $2, $3)`,
            [phone, otpHash, expiresAt]
        );

        // Optional: Trigger external SMS gateway if API key is present
        const smsApiKey = process.env.SMS_API_KEY;
        if (smsApiKey && process.env.NODE_ENV !== 'development') {
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
            message: 'OTP sent successfully',
            debugOtp: process.env.NODE_ENV === 'development' ? otp : undefined
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}