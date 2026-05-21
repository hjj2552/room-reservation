package com.school.reservation.domain.admin;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.school.reservation.support.IntegrationTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

class AdminAuthIntegrationTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Test
    void adminLoginSucceedsAndSessionCanBeRead() throws Exception {
        MockHttpSession session = (MockHttpSession) mockMvc.perform(post("/api/auth/admin/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "username": "admin",
                      "password": "admin1234"
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("admin"))
            .andReturn()
            .getRequest()
            .getSession(false);

        mockMvc.perform(get("/api/auth/admin/me").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("admin"));
    }

    @Test
    void adminLoginFailsWithWrongPassword() throws Exception {
        mockMvc.perform(post("/api/auth/admin/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "username": "admin",
                      "password": "wrong"
                    }
                    """))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value("ADMIN_UNAUTHORIZED"));
    }
}

