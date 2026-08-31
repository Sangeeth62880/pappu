import { supabase, signUp, signIn, signOut, getSession, getCurrentUser } from '../src/api/supabase';

describe('Supabase Auth Client Helpers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('calls supabase.auth.signUp with correct parameters', async () => {
    const mockUser = { id: 'test-user-id', email: 'test@example.com' };
    const spy = jest.spyOn(supabase.auth, 'signUp').mockResolvedValue({
      data: { user: mockUser, session: { access_token: 'fake-jwt-token' } },
      error: null,
    });

    const result = await signUp({
      email: 'test@example.com',
      password: 'securepassword123',
      name: 'Pappu User',
      preferred_language: 'ml',
    });

    expect(spy).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'securepassword123',
      options: {
        data: {
          name: 'Pappu User',
          preferred_language: 'ml',
        },
      },
    });
    expect(result.user.id).toBe('test-user-id');
  });

  it('throws an error if signUp returns an error', async () => {
    jest.spyOn(supabase.auth, 'signUp').mockResolvedValue({
      data: { user: null, session: null },
      error: new Error('User already registered'),
    });

    await expect(
      signUp({
        email: 'existing@example.com',
        password: 'password',
        name: 'Existing',
      })
    ).rejects.toThrow('User already registered');
  });

  it('calls supabase.auth.signInWithPassword with correct credentials', async () => {
    const spy = jest.spyOn(supabase.auth, 'signInWithPassword').mockResolvedValue({
      data: { user: { id: 'test-user-id' }, session: { access_token: 'valid-jwt' } },
      error: null,
    });

    const result = await signIn({ email: 'test@example.com', password: 'secretpassword' });
    expect(spy).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'secretpassword',
    });
    expect(result.session.access_token).toBe('valid-jwt');
  });

  it('calls supabase.auth.signOut successfully', async () => {
    const spy = jest.spyOn(supabase.auth, 'signOut').mockResolvedValue({
      error: null,
    });

    await signOut();
    expect(spy).toHaveBeenCalled();
  });

  it('gets current session and user', async () => {
    jest.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'session-token' } },
      error: null,
    });
    jest.spyOn(supabase.auth, 'getUser').mockResolvedValue({
      data: { user: { id: 'uid-123' } },
      error: null,
    });

    const session = await getSession();
    expect(session.access_token).toBe('session-token');

    const user = await getCurrentUser();
    expect(user.id).toBe('uid-123');
  });
});
