import { describe, expect, it } from 'vitest';
import { customerSchema } from './validation';
const contact = { name: ' Test Contact ', phone: ' +234 (800) 000-0000 ' };
describe('quick offline customer entry', () => {
  it('saves basic name and phone without requiring an email', () => {
    expect(customerSchema.parse(contact)).toEqual({
      name: 'Test Contact',
      phone: '+234 (800) 000-0000',
    });
    for (const email of ['', '   ', null])
      expect(customerSchema.parse({ ...contact, email }).email).toBeNull();
  });
  it('accepts formatted phone numbers and trims optional email', () => {
    expect(
      customerSchema.parse({ ...contact, phone: '0800 000 0000', email: ' person@example.test ' })
        .email,
    ).toBe('person@example.test');
    expect(customerSchema.safeParse({ ...contact, phone: '+44 20 0000 0000' }).success).toBe(true);
  });
  it('rejects unusable contact details before writing a record', () => {
    for (const values of [
      { name: ' ' },
      { phone: 'not-a-phone' },
      { phone: '123' },
      { email: 'not-an-email' },
    ])
      expect(customerSchema.safeParse({ ...contact, ...values }).success).toBe(false);
  });
  it('does not accept account links or privilege fields through contact entry', () => {
    const parsed = customerSchema.parse({
      ...contact,
      profile_id: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
      permissions: { manage_packages: true },
    });
    expect(parsed).not.toHaveProperty('profile_id');
    expect(parsed).not.toHaveProperty('role');
    expect(parsed).not.toHaveProperty('permissions');
  });
});
