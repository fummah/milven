import React, { useEffect, useState } from 'react';
import { Layout, Menu, Typography, Avatar, Grid, Drawer, Button } from 'antd';
import { HomeOutlined, BookOutlined, ReadOutlined, DollarOutlined, FileTextOutlined, UserOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { Link, Outlet, useLocation } from 'react-router-dom';

const { Sider, Content } = Layout;

const isLearningPreviewPath = (pathname) => pathname.startsWith('/student/learn/');

const modernBadge = (iconNode, gradient) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 32,
      height: 32,
      borderRadius: 10,
      background: gradient,
      color: '#fff',
      fontSize: 15,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}
  >
    {iconNode}
  </span>
);

const menuItems = [
  { key: 'student-home', icon: modernBadge(<HomeOutlined />, 'linear-gradient(135deg, #3b82f6, #1d4ed8)'), label: <Link to="/student">Dashboard</Link> },
  { key: 'student-courses', icon: modernBadge(<BookOutlined />, 'linear-gradient(135deg, #8b5cf6, #7c3aed)'), label: <Link to="/student/courses">My Courses</Link> },
  { key: 'student-exams', icon: modernBadge(<ReadOutlined />, 'linear-gradient(135deg, #f97316, #ea580c)'), label: <Link to="/student/exams">Exams</Link> },
  { key: 'student-billing', icon: modernBadge(<DollarOutlined />, 'linear-gradient(135deg, #22c55e, #16a34a)'), label: <Link to="/student/billing">Billing</Link> },
  { key: 'student-invoices', icon: modernBadge(<FileTextOutlined />, 'linear-gradient(135deg, #6366f1, #4f46e5)'), label: <Link to="/student/invoices">Invoices</Link> },
  { key: 'student-account', icon: modernBadge(<UserOutlined />, 'linear-gradient(135deg, #64748b, #475569)'), label: <Link to="/student/account">Account</Link> }
];

export default function StudentLayout() {
  const location = useLocation();
  const isLearningPreview = isLearningPreviewPath(location.pathname);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  
  // Only collapse by default on learning preview pages
  const [collapsed, setCollapsed] = useState(isLearningPreview);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-collapse/expand based on learning preview page
  useEffect(() => {
    if (isLearningPreview) {
      setCollapsed(true);
    } else if (!isMobile) {
      setCollapsed(false);
    }
  }, [isLearningPreview, isMobile]);

  useEffect(() => {
    if (isMobile) setCollapsed(true);
    if (isMobile) setMobileOpen(false);
  }, [isMobile, location.pathname]);

  const selected = (() => {
    const path = location.pathname.replace(/^\/student\/?/, '') || 'home';
    return [`student-${path.split('/')[0]}`];
  })();
  
  const siderWidth = (isMobile ? 0 : (collapsed ? 80 : 260));
  const HEADER_OFFSET = 64;
  const SIDER_TOP_GAP = 12;
  
  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          theme="light"
          width={260}
          collapsedWidth={80}
          style={{
            position: 'fixed',
            left: 0,
            top: HEADER_OFFSET + SIDER_TOP_GAP,
            bottom: 0,
            height: `calc(100vh - ${HEADER_OFFSET + SIDER_TOP_GAP}px)`,
            overflow: 'auto',
            zIndex: 999,
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            borderRight: '1px solid #e2e8f0',
            boxShadow: '4px 0 24px rgba(0,0,0,0.03)'
          }}
          className="student-sider modern-sider"
        >
          {/* Sidebar Header */}
          <div style={{
            padding: '20px 16px',
            borderBottom: '1px solid #f1f5f9',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
            margin: collapsed ? 8 : 12,
            borderRadius: 16,
            marginBottom: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar 
                size={collapsed ? 40 : 44} 
                style={{ 
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  flexShrink: 0
                }} 
                icon={<UserOutlined />} 
              />
              {!collapsed && (
                <div style={{ overflow: 'hidden' }}>
                  <Typography.Text strong style={{ color: '#ffffff', fontSize: 15, display: 'block' }}>
                    Student Portal
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                    Learning Dashboard
                  </Typography.Text>
                </div>
              )}
            </div>
          </div>

          {/* Collapse Toggle Button */}
          <div style={{ padding: '0 12px', marginBottom: 12 }}>
            <Button 
              type="text" 
              onClick={() => setCollapsed(!collapsed)}
              style={{
                width: '100%',
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 10,
                borderRadius: 10,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#64748b',
                fontWeight: 500
              }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <><MenuFoldOutlined /> <span>Collapse Menu</span></>}
            </Button>
          </div>

          <Menu 
            mode="inline" 
            items={menuItems} 
            selectedKeys={selected} 
            style={{ 
              borderRight: 0,
              padding: '0 8px',
              background: 'transparent'
            }} 
          />
        </Sider>
      )}
      <Layout style={{ marginLeft: siderWidth, minHeight: '100vh', transition: 'margin-left 0.2s ease' }}>
        <Content style={{ padding: isMobile ? 12 : 24 }}>
          {isMobile && (
            <div style={{ marginBottom: 12 }}>
              <Button 
                onClick={() => setMobileOpen(true)}
                icon={<MenuUnfoldOutlined />}
                style={{ borderRadius: 10 }}
              >
                Menu
              </Button>
              <Drawer
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }} icon={<UserOutlined />} />
                    <span>Student Menu</span>
                  </div>
                }
                placement="left"
                open={mobileOpen}
                onClose={() => setMobileOpen(false)}
                width={Math.min(320, typeof window !== 'undefined' ? window.innerWidth * 0.86 : 320)}
                className="modern-drawer"
              >
                <Menu mode="inline" items={menuItems} selectedKeys={selected} onClick={() => setMobileOpen(false)} />
              </Drawer>
            </div>
          )}
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

