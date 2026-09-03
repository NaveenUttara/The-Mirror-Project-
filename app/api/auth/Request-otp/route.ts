import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import crypto from 'crypto';

export async function POST(request: Request) {
    try {
        const { phone } = await request.json();

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

        // Hash the OTP before saving to database for security
        const salt = crypto.randomBytes(16).toString('hex');
        const otpHash = crypto.scryptSync(otp, salt, 64).toString('hex') + ':' + salt;

        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // Expires in 10 minutes

        // Save the hashed OTP to the FRSCMP Oracle database.
        const connection = await getConnection();

        try {
            await connection.execute(
                `INSERT INTO MIRROR_OTP_REQUESTS
                    (id, phone, otp_hash, expires_at, attempts)
                 VALUES
                    (MIRROR_OTP_REQ_SEQ.NEXTVAL, :phone, :otpHash, :expiresAt, 0)`,
                { phone, otpHash, expiresAt },
                { autoCommit: true }
            );
        } finally {
            await connection.close();
        }

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
            debugOtp: isTemporaryOtp ? otp : undefined
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
