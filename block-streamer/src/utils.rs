pub fn snake_to_camel(value: &mut serde_json::value::Value) {
    match value {
        serde_json::value::Value::Object(map) => {
            for key in map.keys().cloned().collect::<Vec<String>>() {
                let new_key = key
                    .split('_')
                    .enumerate()
                    .map(|(i, str)| {
                        if i > 0 {
                            return str[..1].to_uppercase() + &str[1..];
                        }
                        str.to_owned()
                    })
                    .collect::<Vec<String>>()
                    .join("");

                if let Some(mut val) = map.remove(&key) {
                    snake_to_camel(&mut val);
                    map.insert(new_key, val);
                }
            }
        }
        serde_json::value::Value::Array(vec) => {
            for val in vec {
                snake_to_camel(val);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn flat() {
        let mut value = json!({
            "first_name": "John",
            "last_name": "Doe"
        });

        snake_to_camel(&mut value);

        assert_eq!(
            value,
            json!({
                "firstName": "John",
                "lastName": "Doe"
            })
        );
    }

    #[test]
    fn nested() {
        let mut value = json!({
            "user_details": {
                "first_name": "John",
                "last_name": "Doe"
            }
        });

        snake_to_camel(&mut value);

        assert_eq!(
            value,
            json!({
                "userDetails": {
                    "firstName": "John",
                    "lastName": "Doe"
                }
            })
        );
    }

    #[test]
    fn array() {
        let mut value = json!([{
            "first_name": "John",
            "last_name": "Doe"
        }, {
            "first_name": "Jane",
            "last_name": "Doe"
        }]);

        snake_to_camel(&mut value);

        assert_eq!(
            value,
            json!([{
                "firstName": "John",
                "lastName": "Doe"
            }, {
                "firstName": "Jane",
                "lastName": "Doe"
            }])
        );
    }

    #[test]
    fn nested_and_array() {
        let mut value = json!({
            "user_details": {
                "personal_info": {
                    "first_name": "John",
                    "last_name": "Doe"
                },
                "address": {
                    "city_name": "Some City",
                    "country_name": "Some Country"
                }
            },
            "user_education": [{
                "school_name": "XYZ High School",
                "degree": "High School Diploma"
            }, {
                "university_name": "ABC University",
                "degree": "Bachelor's"
            }]
        });

        snake_to_camel(&mut value);

        assert_eq!(
            value,
            json!({
                "userDetails": {
                    "personalInfo": {
                        "firstName": "John",
                        "lastName": "Doe"
                    },
                    "address": {
                        "cityName": "Some City",
                        "countryName": "Some Country"
                    }
                },
                "userEducation": [{
                    "schoolName": "XYZ High School",
                    "degree": "High School Diploma"
                }, {
                    "universityName": "ABC University",
                    "degree": "Bachelor's"
                }]
            })
        );
    }
}
