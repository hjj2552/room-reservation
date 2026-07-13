package com.school.reservation.domain.admin;

import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class CsrfController {

    @GetMapping("/csrf")
    public Map<String, String> csrf(
        CsrfToken csrfToken,
        HttpServletRequest request,
        jakarta.servlet.http.HttpServletResponse response
    ) {
        ResponseCookie cookie = ResponseCookie.from("XSRF-TOKEN", csrfToken.getToken())
            .path("/")
            .httpOnly(false)
            .secure(request.isSecure())
            .sameSite("Lax")
            .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());

        return Map.of(
            "headerName", "X-XSRF-TOKEN",
            "parameterName", csrfToken.getParameterName(),
            "token", csrfToken.getToken()
        );
    }
}
