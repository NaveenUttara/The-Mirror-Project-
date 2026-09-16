import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { upsertDemoUser } from '@/lib/demo-store';
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
        const { phone, name, email } = await request.json();

        const medusaResponse = await fetchMedusaAuth('/mirror/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, name, email }),
        });
        if (medusaResponse) {
            return forwardedResponse(medusaResponse);
        }

        const normalizedPhone = typeof phone === 'string' ? phone.replace(/[^0-9+]/g, '').trim() : '';
        const normalizedName = typeof name === 'string' ? name.trim() : '';
        const normalizedEmail = typeof email === 'string' ? email.trim() : '';

        if (!normalizedPhone || normalizedPhone.length < 10) {
            return NextResponse.json({ error: 'Valid mobile number is required' }, { status: 400 });
        }

        if (!normalizedName) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        if (normalizedName.length > 150) {
            return NextResponse.json(
                { error: 'Name must be 150 characters or fewer' },
                { status: 400 },
            );
        }

        if (
            normalizedEmail
            && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ) {
            return NextResponse.json(
                { error: 'Enter a valid email address or leave it blank' },
                { status: 400 },
            );
        }

        const user: UserRow = upsertDemoUser(
            normalizedPhone,
            normalizedName,
            normalizedEmail || null,
        );

        const token = jwt.sign(
            { userId: user.id, phone: user.phone, role: user.role },
            getJwtSecret(),
            { expiresIn: '7d' },
        );

        return NextResponse.json({
            success: true,
            message: 'Login successful',
            token,
            user: { id: user.id, name: user.name, phone: user.phone, email: user.email },
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
