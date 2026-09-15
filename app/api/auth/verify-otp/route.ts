import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { isValidOtp } from '@/lib/otp-crypto';
import {
    deleteDemoOtpRequest,
    findDemoUser,
    getDemoOtpRequest,
    upsertDemoUser,
} from '@/lib/demo-store';
import { getJwtSecret } from '@/lib/jwt-secret';
import { fetchMedusaAuth } from '@/lib/auth-backend';
import { forwardedResponse } from '@/lib/medusa-proxy';

type UserRow = {
    id: number | string;
    name: string;
    phone: string;
    email: string | null;
    role: string | null;
};

export async function POST(request: Request) {
    try {
        const { phone, otp, name, email } = await request.json();

        const medusaResponse = await fetchMedusaAuth('/mirror/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, otp, name, email }),
        });
        if (medusaResponse) {
            return forwardedResponse(medusaResponse);
        }

        const normalizedName = typeof name === 'string' ? name.trim() : '';
        const normalizedEmail = typeof email === 'string' ? email.trim() : '';

        if (!phone || !otp) {
            return NextResponse.json({ error: 'Phone and OTP are required' }, { status: 400 });
        }

        const otpRecord = getDemoOtpRequest(phone);

        if (
            !otpRecord
            || new Date(otpRecord.expiresAt).getTime() <= Date.now()
            || !isValidOtp(String(otp), otpRecord.otpHash)
        ) {
            return NextResponse.json(
                { error: 'Invalid or expired OTP' },
                { status: 400 }
            );
        }

        let user: UserRow;
        const existingUser = findDemoUser(phone);
        const profileIsIncomplete = !existingUser
            || !existingUser.name.trim()
            || existingUser.name.trim().toLowerCase() === 'citizen';

        if (existingUser && !profileIsIncomplete) {
            user = existingUser;
        } else {
            if (!normalizedName) {
                return NextResponse.json({
                    success: true,
                    profileRequired: true,
                    message: 'OTP verified. Complete your profile to continue.',
                });
            }

            if (normalizedName.length > 150) {
                return NextResponse.json(
                    { error: 'Name must be 150 characters or fewer' },
                    { status: 400 }
                );
            }

            if (
                normalizedEmail
                && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
            ) {
                return NextResponse.json(
                    { error: 'Enter a valid email address or leave it blank' },
                    { status: 400 }
                );
            }

            user = upsertDemoUser(
                phone,
                normalizedName,
                normalizedEmail || null,
            );
        }

        deleteDemoOtpRequest(phone);

        const token = jwt.sign(
            { userId: user.id, phone: user.phone, role: user.role },
            getJwtSecret(),
            { expiresIn: '7d' }
        );

        return NextResponse.json({
            success: true,
            message: 'Login successful',
            token,
            user: { id: user.id, name: user.name, phone: user.phone, email: user.email }
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
