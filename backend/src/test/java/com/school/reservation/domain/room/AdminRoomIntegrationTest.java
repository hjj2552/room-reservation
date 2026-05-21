package com.school.reservation.domain.room;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.school.reservation.support.IntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;

class AdminRoomIntegrationTest extends IntegrationTestSupport {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    void adminCanCreateUpdateToggleAndSoftDeleteRoom() throws Exception {
        MockHttpSession session = loginAsAdmin();
        UUID roomId = createRoom(session, "Room Test A");

        mockMvc.perform(put("/api/admin/rooms/{roomId}", roomId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "Room Test A Updated",
                      "location": "Annex 1F",
                      "capacity": 24,
                      "description": "Updated room",
                      "enabled": true
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Room Test A Updated"))
            .andExpect(jsonPath("$.capacity").value(24));

        mockMvc.perform(patch("/api/admin/rooms/{roomId}/enabled", roomId)
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "enabled": false
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(false));

        mockMvc.perform(delete("/api/admin/rooms/{roomId}", roomId).session(session))
            .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/admin/rooms/{roomId}", roomId).session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deleted").value(true))
            .andExpect(jsonPath("$.enabled").value(false));

        createRoom(session, "Room Test A Updated");
    }

    @Test
    void duplicateRoomNameFailsWithConflict() throws Exception {
        MockHttpSession session = loginAsAdmin();
        createRoom(session, "Room Duplicate A");

        mockMvc.perform(post("/api/admin/rooms")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "Room Duplicate A",
                      "location": "Annex 2F",
                      "capacity": 12,
                      "description": "Duplicate",
                      "enabled": true
                    }
                    """))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("ROOM_NAME_DUPLICATED"));
    }

    private UUID createRoom(MockHttpSession session, String name) throws Exception {
        String response = mockMvc.perform(post("/api/admin/rooms")
                .session(session)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "%s",
                      "location": "Annex 1F",
                      "capacity": 20,
                      "description": "Test room",
                      "enabled": true
                    }
                    """.formatted(name)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id", notNullValue()))
            .andReturn()
            .getResponse()
            .getContentAsString();
        JsonNode json = objectMapper.readTree(response);
        return UUID.fromString(json.get("id").asText());
    }

    private MockHttpSession loginAsAdmin() throws Exception {
        return (MockHttpSession) mockMvc.perform(post("/api/auth/admin/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "username": "admin",
                      "password": "admin1234"
                    }
                    """))
            .andExpect(status().isOk())
            .andReturn()
            .getRequest()
            .getSession(false);
    }
}
