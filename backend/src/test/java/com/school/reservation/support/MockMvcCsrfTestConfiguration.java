package com.school.reservation.support;

import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcBuilderCustomizer;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@TestConfiguration
public class MockMvcCsrfTestConfiguration {

    @Bean
    MockMvcBuilderCustomizer csrfDefaultRequestCustomizer() {
        return builder -> builder.defaultRequest(get("/").with(csrf()));
    }
}
