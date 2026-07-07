package com.school.reservation.global.config;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class RequiredEnvironmentValidator implements BeanFactoryPostProcessor, EnvironmentAware {

    private static final Set<String> ENV_MANAGED_PROFILES = Set.of("local", "dev", "prod");
    private static final List<String> REQUIRED_VARIABLES = List.of(
        "DB_URL",
        "DB_USERNAME",
        "DB_PASSWORD",
        "ADMIN_USERNAME",
        "ADMIN_PASSWORD"
    );

    private Environment environment;

    @Override
    public void setEnvironment(Environment environment) {
        this.environment = environment;
    }

    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
        String[] activeProfiles = environment.getActiveProfiles();
        if (activeProfiles.length == 0) {
            throw new IllegalStateException(
                "SPRING_PROFILES_ACTIVE must be set explicitly. Use local, dev, prod, test, or e2e."
            );
        }

        boolean needsEnvironmentVariables = Arrays.stream(activeProfiles).anyMatch(ENV_MANAGED_PROFILES::contains);
        if (!needsEnvironmentVariables) {
            return;
        }

        List<String> missingVariables = new ArrayList<>();
        for (String variable : REQUIRED_VARIABLES) {
            if (!StringUtils.hasText(environment.getProperty(variable))) {
                missingVariables.add(variable);
            }
        }

        if (!missingVariables.isEmpty()) {
            throw new IllegalStateException(
                "Missing required environment variables for active profile(s) "
                    + String.join(", ", activeProfiles)
                    + ": "
                    + String.join(", ", missingVariables)
            );
        }
    }
}
