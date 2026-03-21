"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Flex, Select, Spinner, Stack, Text } from "@sanity/ui";
import { ArrayOfPrimitivesInputProps, set, unset, useClient } from "sanity";

import { apiVersion } from "../env";
import {
  type CategoryPathOption,
  fetchRecipeCategoryPathOptions,
  normalizeCategoryPath,
  serializeCategoryPath,
} from "../lib/recipeMetadata";

export function RecipeCategoryPathInput(
  props: ArrayOfPrimitivesInputProps<string | number | boolean>,
) {
  const client = useClient({ apiVersion });
  const [options, setOptions] = useState<CategoryPathOption[]>([]);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const currentValue = useMemo(() => normalizeCategoryPath(props.value), [props.value]);
  const currentLabel = useMemo(() => serializeCategoryPath(currentValue), [currentValue]);

  const suggestedOptions = useMemo(() => {
    if (!currentLabel) return options.slice(0, 10);

    const normalizedCurrentLabel = currentLabel.toLowerCase();
    return options
      .filter((option) => option.label.toLowerCase().includes(normalizedCurrentLabel))
      .slice(0, 10);
  }, [currentLabel, options]);

  useEffect(() => {
    let isMounted = true;

    async function loadOptions() {
      try {
        const nextOptions = await fetchRecipeCategoryPathOptions(client);
        if (!isMounted) return;

        setOptions(nextOptions);
        setLoadError(null);
      } catch (error) {
        if (!isMounted) return;

        setLoadError(error instanceof Error ? error.message : "Could not load categories.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadOptions();

    return () => {
      isMounted = false;
    };
  }, [client]);

  function applyCategoryPath(parts: string[]) {
    const nextValue = normalizeCategoryPath(parts);
    props.onChange(nextValue.length ? set(nextValue) : unset());
  }

  function applySelectedCategory() {
    const selectedOption = options.find((option) => option.label === selectedLabel);
    if (!selectedOption) return;

    applyCategoryPath(selectedOption.parts);
  }

  return (
    <Stack space={3}>
      <Card padding={3} radius={2} tone="transparent" border>
        <Stack space={3}>
          <Text size={1} muted>
            Reuse an existing category path when possible, or keep typing a new one below.
          </Text>

          {isLoading ? (
            <Flex align="center" gap={2}>
              <Spinner muted />
              <Text size={1} muted>
                Loading existing categories...
              </Text>
            </Flex>
          ) : null}

          {loadError ? (
            <Text size={1} muted>
              Existing categories could not be loaded right now. You can still enter a new one manually.
            </Text>
          ) : null}

          {!isLoading && !loadError ? (
            <Stack space={3}>
              <Flex gap={2}>
                <Select
                  value={selectedLabel}
                  onChange={(event) => setSelectedLabel(event.currentTarget.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">Choose an existing category</option>
                  {options.map((option) => (
                    <option key={option.label} value={option.label}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Button
                  mode="ghost"
                  text="Use selected"
                  disabled={!selectedLabel}
                  onClick={applySelectedCategory}
                />
              </Flex>

              {suggestedOptions.length ? (
                <Stack space={2}>
                  <Text size={1} muted>
                    {currentLabel ? "Matching existing categories" : "Existing categories"}
                  </Text>
                  <Flex gap={2} wrap="wrap">
                    {suggestedOptions.map((option) => (
                      <Button
                        key={option.label}
                        mode={option.label === currentLabel ? "default" : "bleed"}
                        text={option.label}
                        onClick={() => applyCategoryPath(option.parts)}
                      />
                    ))}
                  </Flex>
                </Stack>
              ) : (
                <Text size={1} muted>
                  No existing category matches the current entry yet.
                </Text>
              )}
            </Stack>
          ) : null}
        </Stack>
      </Card>

      {props.renderDefault(props)}
    </Stack>
  );
}
