import React from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from './supabase-client';
import type { UserProfile, UserProfileInsert } from './supabase-client';

// 인증 상태 타입
export interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
}

// 로그인 파라미터 타입
export interface LoginParams {
  email: string;
  password: string;
}

// 회원가입 파라미터 타입
export interface SignUpParams {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  companyName?: string;
  role?: 'admin' | 'manager' | 'driver' | 'customer';
}

// 사용자 프로필 업데이트 파라미터 타입
export interface UpdateProfileParams {
  fullName?: string;
  phone?: string;
  companyName?: string;
}

// 인증 유틸리티 클래스
export class AuthService {
  // 로그인
  static async signIn({ email, password }: LoginParams) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new Error(error.message);
      }

      // 사용자 프로필 가져오기
      if (data.user) {
        const profile = await this.getUserProfile(data.user.id);
        return { user: profile, session: data.session };
      }

      return { user: null, session: data.session };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '로그인에 실패했습니다.');
    }
  }

  // 회원가입
  static async signUp(params: SignUpParams) {
    try {
      const { email, password, fullName, phone, companyName, role = 'customer' } = params;

      // Supabase Auth로 사용자 생성
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      // 사용자 프로필 생성
      if (data.user) {
        const profileData: UserProfileInsert = {
          id: data.user.id,
          email: data.user.email!,
          full_name: fullName,
          phone,
          company_name: companyName,
          role,
        };

        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert(profileData);

        if (profileError) {
          // 프로필 생성 실패 시 사용자 삭제
          await supabase.auth.admin.deleteUser(data.user.id);
          throw new Error('사용자 프로필 생성에 실패했습니다.');
        }

        return { user: data.user, session: data.session };
      }

      return { user: null, session: data.session };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '회원가입에 실패했습니다.');
    }
  }

  // 로그아웃
  static async signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '로그아웃에 실패했습니다.');
    }
  }

  // 현재 사용자 가져오기
  static async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error) {
        throw new Error(error.message);
      }

      if (!user) {
        return null;
      }

      // 사용자 프로필 가져오기
      return await this.getUserProfile(user.id);
    } catch (error) {
      console.error('사용자 정보 가져오기 실패:', error);
      return null;
    }
  }

  // 사용자 프로필 가져오기
  static async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('사용자 프로필 가져오기 실패:', error);
      return null;
    }
  }

  // 사용자 프로필 업데이트
  static async updateUserProfile(userId: string, updates: UpdateProfileParams) {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '프로필 업데이트에 실패했습니다.');
    }
  }

  // 비밀번호 재설정
  static async resetPassword(email: string) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '비밀번호 재설정 이메일 전송에 실패했습니다.');
    }
  }

  // 비밀번호 변경
  static async updatePassword(newPassword: string) {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '비밀번호 변경에 실패했습니다.');
    }
  }

  // 이메일 확인
  static async verifyEmail() {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: (await supabase.auth.getUser()).data.user?.email!,
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '이메일 확인 메일 전송에 실패했습니다.');
    }
  }

  // 사용자 역할 확인
  static async getUserRole(userId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .rpc('get_user_role', { user_id: userId });

      if (error) {
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('사용자 역할 가져오기 실패:', error);
      return null;
    }
  }

  // 권한 확인
  static async hasPermission(requiredRole: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .rpc('has_permission', { required_role: requiredRole });

      if (error) {
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      console.error('권한 확인 실패:', error);
      return false;
    }
  }

  // 세션 새로고침
  static async refreshSession() {
    try {
      const { data, error } = await supabase.auth.refreshSession();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '세션 새로고침에 실패했습니다.');
    }
  }
}

// 인증 상태 관리 훅 (React용)
export const useAuth = () => {
  const [authState, setAuthState] = React.useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    // 초기 사용자 상태 확인
    const getInitialUser = async () => {
      try {
        const user = await AuthService.getCurrentUser();
        setAuthState({
          user,
          loading: false,
          error: null,
        });
      } catch (error) {
        setAuthState({
          user: null,
          loading: false,
          error: error instanceof Error ? error.message : '사용자 정보를 가져올 수 없습니다.',
        });
      }
    };

    getInitialUser();

    // 인증 상태 변경 리스너
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const user = await AuthService.getUserProfile(session.user.id);
          setAuthState({
            user,
            loading: false,
            error: null,
          });
        } else if (event === 'SIGNED_OUT') {
          setAuthState({
            user: null,
            loading: false,
            error: null,
          });
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return authState;
};

// 인증 가드 (HOC)
export const withAuth = <P extends object>(
  Component: React.ComponentType<P>,
  requiredRole?: string
) => {
  return function AuthenticatedComponent(props: P) {
    const { user, loading, error } = useAuth();

    if (loading) {
      return <div>로딩 중...</div>;
    }

    if (error) {
      return <div>오류: {error} </div>;
    }

    if (!user) {
      return <div>로그인이 필요합니다.</div>;
    }

    if (requiredRole && user.role !== requiredRole) {
      return <div>접근 권한이 없습니다.</div>;
    }

    return <Component {...props} />;
  };
};


